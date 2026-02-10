import React, { useState, useEffect, useMemo } from 'react';
import { Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, Line } from 'recharts';
import * as XLSX from 'xlsx';
import { parseDurationToHours, transformDashboardData, transformPlantRegistry, transformProblemLogs } from '../utils/dataCleaner';

interface PlantProblems {
  id: number;
  name: string;
  cause: string;
  observation: string;
  when: Date | string;
  end: Date | string;
  duration: string;
  equipamentos: string[];
  status: 'Aberto' | 'Concluido';
  resolution: string;
}

interface PlantMetadata {
  id: string; 
  name: string;
  uf: string;
  complexo: string;
  capacity?: number;
}

interface PlantDailyMetrics {
  actual: number;
  expected: number;
  performance: number;
  problems: PlantProblems[]; 
}

interface DayData {
  DIA: string;
  plants: {
    [plantName: string]: PlantDailyMetrics;
  };
}

const MONTH_MAP: { [key: string]: string } = {
  '01': 'JANEIRO', '02': 'FEVEREIRO', '03': 'MARÇO', '04': 'ABRIL',
  '05': 'MAIO', '06': 'JUNHO', '07': 'JULHO', '08': 'AGOSTO',
  '09': 'SETEMBRO', '10': 'OUTUBRO', '11': 'NOVEMBRO', '12': 'DEZEMBRO'
};

const ProblemDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload?.hasProblem && !isNaN(cx) && !isNaN(cy)) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="rgba(239, 68, 68, 0.3)" />
        <circle cx={cx} cy={cy} r={2.5} fill="#ef4444" stroke="white" strokeWidth={1} />
      </g>
    );
  }
  return null;
};

const PlantPerformanceVisualization = () => {
  const [registry, setRegistry] = useState<PlantMetadata[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [problems, setProblems] = useState<PlantProblems[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'actual' | 'expected' | 'both'>('both');

  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedComplex, setSelectedComplex] = useState<string>('ALL');
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  const GERACAO_URL = "/data/CONTROLE DE Geração 02_2026_FEVEREIRO.xlsm";
  const OCORRENCIAS_URL = "/data/122025_Geração_Disponibilidade_REV00.xlsx";
  const METADATA_URL = '/data/Inversores_REV11_BC_Brasol.xlsx';

  useEffect(() => {
    loadExcelData();
  }, []);

  const loadExcelData = async () => {
    setLoading(true);
    try {
      const resMeta = await fetch(METADATA_URL);
      const wbMeta = XLSX.read(await resMeta.arrayBuffer(), { type: 'array' });
      setRegistry(transformPlantRegistry(wbMeta));

      const resGen = await fetch(GERACAO_URL);
      const wbGen = XLSX.read(await resGen.arrayBuffer(), { type: 'array' });
      const genData = transformDashboardData(wbGen);
      setData(genData);
      
      if (genData.length > 0) {
        setSelectedYear(genData[0].DIA.substring(0, 4));
        setSelectedMonth(genData[0].DIA.substring(5, 7));
      }

      const resProb = await fetch(OCORRENCIAS_URL);
      const wbProb = XLSX.read(await resProb.arrayBuffer(), { type: 'array', cellDates: true });
      setProblems(transformProblemLogs(wbProb));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

  const availableYears = useMemo(() => {
    const years = new Set(data.map(d => d.DIA.substring(0, 4)));
    return Array.from(years).sort();
  }, [data]);

  const availableMonths = useMemo(() => {
    let filtered = data;
    if (selectedYear !== 'ALL') filtered = data.filter(d => d.DIA.startsWith(selectedYear));
    const months = new Set(filtered.map(d => d.DIA.substring(5, 7)));
    return Array.from(months).sort();
  }, [data, selectedYear]);

  const uniqueStates = useMemo(() => Array.from(new Set(registry.map(p => p.uf))).sort(), [registry]);
  
  const uniqueComplexes = useMemo(() => {
    let filtered = registry;
    if (selectedState !== 'ALL') filtered = filtered.filter(p => p.uf === selectedState);
    return Array.from(new Set(filtered.map(p => p.complexo))).sort();
  }, [registry, selectedState]);

  const availablePlantsList = useMemo(() => {
    return registry.filter(plant => {
      const matchState = selectedState === 'ALL' || plant.uf === selectedState;
      const matchComplex = selectedComplex === 'ALL' || plant.complexo === selectedComplex;
      return matchState && matchComplex;
    });
  }, [registry, selectedState, selectedComplex]);

  const activePlantNames = useMemo(() => {
    if (selectedPlants.length > 0) return selectedPlants;
    return availablePlantsList.map(p => p.name);
  }, [selectedPlants, availablePlantsList]);

  const togglePlantSelection = (plantName: string) => {
    setSelectedPlants(prev => 
      prev.includes(plantName) ? prev.filter(p => p !== plantName) : [...prev, plantName]
    );
  };

  const expectedDaysInMonth = useMemo(() => {
    if (selectedYear === 'ALL' || selectedMonth === 'ALL') return null;
    return getDaysInMonth(parseInt(selectedYear), parseInt(selectedMonth));
  }, [selectedYear, selectedMonth]);

  const filteredDataByMonth = useMemo(() => {
    let filtered = data;
    if (selectedYear !== 'ALL') filtered = filtered.filter(d => d.DIA.startsWith(selectedYear));
    if (selectedMonth !== 'ALL') filtered = filtered.filter(d => d.DIA.substring(5, 7) === selectedMonth);
    if (expectedDaysInMonth !== null) {
      filtered = filtered.filter(d => parseInt(d.DIA.substring(8, 10)) <= expectedDaysInMonth);
    }
    return filtered;
  }, [data, selectedYear, selectedMonth, expectedDaysInMonth]);

  const filteredProblems = useMemo(() => {
    return problems.filter(p => {
        if (!activePlantNames.includes(p.name)) return false;
        const probDate = p.when instanceof Date ? p.when.toISOString().substring(0, 10) : String(p.when).substring(0, 10);
        const probYear = probDate.substring(0, 4);
        const probMonth = probDate.substring(5, 7);
        if (selectedYear !== 'ALL' && probYear !== selectedYear) return false;
        if (selectedMonth !== 'ALL' && probMonth !== selectedMonth) return false;
        return true;
    });
  }, [problems, activePlantNames, selectedYear, selectedMonth]);

  const chartData = useMemo(() => {
    if (filteredDataByMonth.length === 0) return [];
    const dateMap = new Map<string, any>();
    filteredDataByMonth.forEach(day => {
      if (dateMap.has(day.DIA)) return;
      let dailyActual = 0, dailyExpected = 0;
      activePlantNames.forEach(plantName => {
        const metrics = day.plants[plantName];
        if (metrics) {
          dailyActual += metrics.actual;
          dailyExpected += metrics.expected;
        }
      });
      const performance = dailyExpected > 0 ? (dailyActual / dailyExpected) * 100 : 0;
      const dayProblems = filteredProblems.filter(p => {
        const probDate = p.when instanceof Date ? p.when.toISOString().split('T')[0] : String(p.when).split(' ')[0];
        return probDate === day.DIA;
      });
      dateMap.set(day.DIA, {
        date: day.DIA,
        actual: dailyActual,
        expected: dailyExpected,
        performance,
        problems: dayProblems,
        hasProblem: dayProblems.length > 0
      });
    });
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredDataByMonth, activePlantNames, filteredProblems]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const totalActual = chartData.reduce((sum, d) => sum + d.actual, 0);
    const totalExpected = chartData.reduce((sum, d) => sum + d.expected, 0);
    const avgPerformance = chartData.reduce((sum, d) => sum + d.performance, 0) / chartData.length;
    const totalPeriodHours = chartData.length * 24 * activePlantNames.length;
    let generalDowntimeHours = 0, technicalDowntimeHours = 0;
    filteredProblems.forEach(prob => {
        const hours = parseDurationToHours(prob.duration);
        generalDowntimeHours += hours;
        const resolution = prob.resolution ? prob.resolution.toString().trim().toLowerCase() : '';
        if (resolution !== 'distribuidora') technicalDowntimeHours += hours;
    });
    const generalAvail = totalPeriodHours > 0 ? ((totalPeriodHours - generalDowntimeHours) / totalPeriodHours) * 100 : 0;
    const technicalAvail = totalPeriodHours > 0 ? ((totalPeriodHours - technicalDowntimeHours) / totalPeriodHours) * 100 : 0;
    return { totalActual, totalExpected, avgPerformance, generalAvailability: generalAvail, technicalAvailability: technicalAvail };
  }, [chartData, activePlantNames.length, filteredProblems]);

  const getPerformanceColor = (performance: number) => {
    if (performance >= 100) return '#34d399';
    if (performance >= 80) return '#fbbf24';
    return '#f87171';
  };

  const getAvailabilityColor = (avail: number) => {
    if (avail >= 99.5) return 'bg-green-500';
    if (avail >= 98) return 'bg-green-400';
    if (avail >= 95) return 'bg-yellow-400';
    return 'bg-red-500';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
     if (active && payload?.length) {
       const dataPoint = payload[0].payload;
       const problems = dataPoint.problems as PlantProblems[]; 
       return (
         <div className="bg-white p-3 border border-slate-300 rounded-lg shadow-xl max-w-sm">
           <p className="font-bold text-slate-900 mb-2">{label}</p>
           {payload.map((entry: any, idx: number) => (
             <p key={idx} className="text-sm flex justify-between gap-3 mb-1">
                <span style={{ color: entry.color }} className="font-semibold">{entry.name}:</span>
                <span className="font-bold">{Number(entry.value).toFixed(2)} MWh</span>
             </p>
           ))}
           <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between">
              <span className="text-sm text-slate-600">Performance:</span>
              <span className={`text-sm font-bold ${dataPoint.performance >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                 {dataPoint.performance.toFixed(1)}%
              </span>
           </div>
           {problems?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-red-200">
                 <p className="text-xs font-bold text-red-600 mb-1">⚠️ {problems.length} Ocorrência(s)</p>
              </div>
           )}
         </div>
       );
     }
     return null;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-xl font-semibold text-gray-600">Carregando dados...</div>
    </div>
  );

  return (
    <div className="w-screen h-screen bg-gray-50 flex flex-col overflow-hidden">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">O&M SOLAR | KPI's</h1>
            <p className="text-xs text-gray-500">Dashboard de Performance</p>
          </div>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex gap-4 justify-center">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-3 min-w-[140px]">
            <div className="text-3xl font-bold text-gray-900">{activePlantNames.length}</div>
            <div className="text-xs text-gray-600 mt-1">Usinas</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-3 min-w-[140px]">
            <div className="text-3xl font-bold text-blue-600">{stats ? stats.totalActual.toFixed(2) : '0.00'}</div>
            <div className="text-xs text-gray-600 mt-1">MWp</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-3 min-w-[140px]">
            <div className={`text-3xl font-bold ${stats && stats.generalAvailability >= 98 ? 'text-green-600' : 'text-red-600'}`}>
              {stats ? stats.generalAvailability.toFixed(2) : '0.00'}%
            </div>
            <div className="text-xs text-gray-600 mt-1">Disp. Global</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-3 min-w-[140px]">
            <div className={`text-3xl font-bold ${stats && stats.technicalAvailability >= 99 ? 'text-green-600' : 'text-orange-600'}`}>
              {stats ? stats.technicalAvailability.toFixed(2) : '0.00'}%
            </div>
            <div className="text-xs text-gray-600 mt-1">Disp. Técnica</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-3 min-w-[140px]">
            <div className={`text-3xl font-bold ${stats && stats.avgPerformance >= 100 ? 'text-green-600' : 'text-red-600'}`}>
              {stats ? stats.avgPerformance.toFixed(2) : '0.00'}%
            </div>
            <div className="text-xs text-gray-600 mt-1">Performance</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <div className="w-72 bg-gray-100 border-r border-gray-200 p-4 overflow-y-auto">
          
          {/* UF Filter */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-2">UF</label>
            <select 
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={selectedState}
              onChange={(e) => { setSelectedState(e.target.value); setSelectedComplex('ALL'); setSelectedPlants([]); }}
            >
              <option value="ALL">Todos</option>
              {uniqueStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>

          {/* UFV Filter */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-2">UFV</label>
            <select 
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={selectedComplex}
              onChange={(e) => { setSelectedComplex(e.target.value); setSelectedPlants([]); }}
            >
              <option value="ALL">Todos</option>
              {uniqueComplexes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Year Filter */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-2">ANO</label>
            <div className="bg-white border border-gray-300 rounded-lg px-3 py-2">
              <div className="text-sm font-bold text-gray-900">{selectedYear === 'ALL' ? 'Todos' : selectedYear}</div>
            </div>
          </div>

          {/* Month Filter */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-2">MÊS</label>
            <div className="flex gap-2">
              {availableMonths.map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    selectedMonth === m 
                      ? 'bg-blue-600 text-white shadow-md' 
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {MONTH_MAP[m] || m}
                </button>
              ))}
            </div>
          </div>

          {/* Plant List */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Usinas
              </label>
              {selectedPlants.length > 0 && (
                <button onClick={() => setSelectedPlants([])} className="text-xs text-blue-600 hover:underline">
                  Limpar
                </button>
              )}
            </div>
            
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {(() => {
                const plantAvailabilities = availablePlantsList.map(plant => {
                  const plantProblems = problems.filter(p => {
                    if (p.name !== plant.name) return false;
                    const probDate = p.when instanceof Date ? p.when.toISOString().substring(0, 10) : String(p.when).substring(0, 10);
                    const probYear = probDate.substring(0, 4);
                    const probMonth = probDate.substring(5, 7);
                    if (selectedYear !== 'ALL' && probYear !== selectedYear) return false;
                    if (selectedMonth !== 'ALL' && probMonth !== selectedMonth) return false;
                    return true;
                  });
                  const hoursCalc = chartData.length > 0 ? chartData.length * 24 : 720;
                  let totalDowntime = 0;
                  plantProblems.forEach(prob => totalDowntime += parseDurationToHours(prob.duration));
                  const availability = hoursCalc > 0 ? ((hoursCalc - totalDowntime) / hoursCalc) * 100 : 100;
                  return { name: plant.name, availability };
                })
                .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
                .sort((a, b) => b.availability - a.availability);

                return plantAvailabilities.map((plant, idx) => {
                  const isSelected = selectedPlants.includes(plant.name);
                  return (
                    <button
                      key={idx}
                      onClick={() => togglePlantSelection(plant.name)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all ${
                        isSelected ? 'bg-blue-50 border-2 border-blue-400' : 'bg-white border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      }`}>
                        {isSelected && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-medium text-gray-900 truncate">{plant.name}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full ${getAvailabilityColor(plant.availability)}`} style={{ width: `${plant.availability}%` }} />
                        </div>
                        <span className={`text-xs font-bold min-w-[48px] text-right ${plant.availability >= 98 ? 'text-green-600' : 'text-red-600'}`}>
                          {plant.availability.toFixed(1)}%
                        </span>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Chart Area */}
          <div className="flex-1 p-6 overflow-hidden">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
              <h2 className="text-base font-bold text-gray-900 mb-3">
                Timeline de Geração - {selectedPlants.length > 0 ? `${selectedPlants.length} Usina(s)` : 'Todas'}
              </h2>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(val) => val.substring(5)} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} label={{ value: 'Geração (MWh)', angle: -90, position: 'insideLeft', fill: '#6b7280' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" />
                    {(viewType === 'expected' || viewType === 'both') && (
                      <Line type="monotone" dataKey="expected" stroke="#a855f7" strokeWidth={2.5} dot={false} name="Esperado (P50)" />
                    )}
                    {(viewType === 'actual' || viewType === 'both') && (
                      <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorActual)" name="Atual" dot={<ProblemDot />} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Table */}
          <div className="h-64 border-t border-gray-200 bg-gray-50 p-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-full flex flex-col">
              <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Ocorrências e Problemas - {selectedPlants.length > 0 ? selectedPlants.join(', ') : 'Todas Usinas'}
              </h2>
              
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Início</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Duração</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Equipamentos</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Causa</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProblems.slice(0, 5).map(prob => (
                      <tr key={prob.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">
                          {prob.when instanceof Date ? prob.when.toLocaleDateString('pt-BR') : String(prob.when).substring(0, 10)}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold text-gray-900">
                          {typeof prob.duration === 'number' ? `${(prob.duration * 24).toFixed(0)}h ${((prob.duration * 24 % 1) * 60).toFixed(0)}m` : String(prob.duration)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {prob.equipamentos?.slice(0, 3).map((eq, i) => (
                              <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{eq}</span>
                            ))}
                            {prob.equipamentos?.length > 3 && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">+{prob.equipamentos.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{typeof prob.cause === 'string' ? prob.cause : 'N/A'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            prob.status === 'Concluido' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {prob.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PlantPerformanceVisualization;