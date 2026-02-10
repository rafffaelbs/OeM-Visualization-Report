import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, Line, LineChart } from 'recharts';
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
  uf: string;       // e.g., "BA", "RN"
  complexo: string; // e.g., "Complexo Seridó"
  capacity?: number; // Optional: installed capacity
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

interface DashboardData {
  registry: PlantMetadata[]; // Array of all available plants and their info
  dailyData: DayData[];      // Your time-series data
}


// --- Constants ---
const MONTH_MAP: { [key: string]: string } = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
};

// --- Helper Components ---
const ProblemDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload && payload.hasProblem && !isNaN(cx) && !isNaN(cy)) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill="rgba(239, 68, 68, 0.3)" />
        <circle cx={cx} cy={cy} r={2} fill="#ef4444" stroke="white" strokeWidth={1} />
      </g>
    );
  }
  return null;
};

const PlantPerformanceVisualization = () => {
  // --- State ---
  const [registry, setRegistry] = useState<PlantMetadata[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [problems, setProblems] = useState<PlantProblems[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'actual' | 'expected' | 'both'>('both');

  // --- Filters ---
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedComplex, setSelectedComplex] = useState<string>('ALL');
  
  // CHANGED: Multi-select state for plants
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);

  // --- Time Filters ---
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // URLs
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
        const firstDate = genData[0].DIA;
        const firstYear = firstDate.substring(0, 4);
        const firstMonth = firstDate.substring(5, 7);
        setSelectedYear(firstYear);
        setSelectedMonth(firstMonth);
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

  // --- Helpers ---
  const getDaysInMonth = (year: number, month: number): number => {
    return new Date(year, month, 0).getDate();
  };

  // --- Option Lists ---
  const availableYears = useMemo(() => {
    const years = new Set(data.map(d => d.DIA.substring(0, 4)));
    return Array.from(years).sort();
  }, [data]);

  const availableMonths = useMemo(() => {
    let filtered = data;
    if (selectedYear !== 'ALL') {
      filtered = data.filter(d => d.DIA.startsWith(selectedYear));
    }
    const months = new Set(filtered.map(d => d.DIA.substring(5, 7)));
    return Array.from(months).sort();
  }, [data, selectedYear]);

  const uniqueStates = useMemo(() => Array.from(new Set(registry.map(p => p.uf))).sort(), [registry]);
  
  const uniqueComplexes = useMemo(() => {
    let filtered = registry;
    if (selectedState !== 'ALL') {
      filtered = filtered.filter(p => p.uf === selectedState);
    }
    return Array.from(new Set(filtered.map(p => p.complexo))).sort();
  }, [registry, selectedState]);

  // --- Active Plants Logic ---
  // These are the plants available based on State/Complex filters
  const availablePlantsList = useMemo(() => {
    return registry.filter(plant => {
      const matchState = selectedState === 'ALL' || plant.uf === selectedState;
      const matchComplex = selectedComplex === 'ALL' || plant.complexo === selectedComplex;
      return matchState && matchComplex;
    });
  }, [registry, selectedState, selectedComplex]);

  // These are the plants actually shown in charts (either the user selections OR all available if none selected)
  const activePlantNames = useMemo(() => {
    if (selectedPlants.length > 0) {
      return selectedPlants;
    }
    return availablePlantsList.map(p => p.name);
  }, [selectedPlants, availablePlantsList]);

  // --- Interaction Handler ---
  const togglePlantSelection = (plantName: string) => {
    setSelectedPlants(prev => {
      if (prev.includes(plantName)) {
        return prev.filter(p => p !== plantName); // Deselect
      } else {
        return [...prev, plantName]; // Select
      }
    });
  };

  // --- Aggregation Logic ---
  const expectedDaysInMonth = useMemo(() => {
    if (selectedYear === 'ALL' || selectedMonth === 'ALL') return null;
    return getDaysInMonth(parseInt(selectedYear), parseInt(selectedMonth));
  }, [selectedYear, selectedMonth]);

  const filteredDataByMonth = useMemo(() => {
    let filtered = data;
    
    if (selectedYear !== 'ALL') {
      filtered = filtered.filter(d => d.DIA.startsWith(selectedYear));
    }
    
    if (selectedMonth !== 'ALL') {
      filtered = filtered.filter(d => d.DIA.substring(5, 7) === selectedMonth);
    }
    
    if (expectedDaysInMonth !== null) {
      filtered = filtered.filter(d => {
        const day = parseInt(d.DIA.substring(8, 10));
        return day <= expectedDaysInMonth;
      });
    }
    
    return filtered;
  }, [data, selectedYear, selectedMonth, expectedDaysInMonth]);

  const filteredProblems = useMemo(() => {
    return problems.filter(p => {
        if (!activePlantNames.includes(p.name)) return false;
        
        const probDate = p.when instanceof Date 
            ? p.when.toISOString().substring(0, 10) 
            : String(p.when).substring(0, 10);
        
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

      let dailyActual = 0;
      let dailyExpected = 0;

      // Sum only for ACTIVE plants (Selected or All if none selected)
      activePlantNames.forEach(plantName => {
        const metrics = day.plants[plantName];
        if (metrics) {
          dailyActual += metrics.actual;
          dailyExpected += metrics.expected;
        }
      });

      const performance = dailyExpected > 0 ? (dailyActual / dailyExpected) * 100 : 0;

      const dayProblems = filteredProblems.filter(p => {
        const probDate = p.when instanceof Date 
            ? p.when.toISOString().split('T')[0] 
            : String(p.when).split(' ')[0];
        return probDate === day.DIA;
      });

      dateMap.set(day.DIA, {
        date: day.DIA,
        actual: dailyActual,
        expected: dailyExpected,
        performance: performance,
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
    
    let generalDowntimeHours = 0;
    let technicalDowntimeHours = 0;

    filteredProblems.forEach(prob => {
        const hours = parseDurationToHours(prob.duration);
        generalDowntimeHours += hours;
        
        const resolution = prob.resolution ? prob.resolution.toString().trim().toLowerCase() : '';
        if (resolution !== 'distribuidora') {
            technicalDowntimeHours += hours;
        }
    });

    const generalAvail = totalPeriodHours > 0 ? ((totalPeriodHours - generalDowntimeHours) / totalPeriodHours) * 100 : 0;
    const technicalAvail = totalPeriodHours > 0 ? ((totalPeriodHours - technicalDowntimeHours) / totalPeriodHours) * 100 : 0;

    return {
      totalActual,
      totalExpected,
      avgPerformance,
      generalAvailability: generalAvail,
      technicalAvailability: technicalAvail
    };
  }, [chartData, activePlantNames.length, filteredProblems]);

  // --- Render Helpers ---
  const getPerformanceColor = (performance: number) => {
    if (performance >= 120) return '#6366f1';
    if (performance >= 100) return '#34d399';
    if (performance >= 80) return '#fbbf24';
    if (performance >= 60) return '#fb923c';
    return '#f87171';
  };

  const getAvailabilityColor = (avail: number) => {
    if (avail >= 99.5) return 'bg-green-500';
    if (avail >= 98) return 'bg-green-400';
    if (avail >= 95) return 'bg-yellow-400';
    if (avail >= 90) return 'bg-orange-400';
    return 'bg-red-500';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
     if (active && payload && payload.length) {
       const dataPoint = payload[0].payload;
       const problems = dataPoint.problems as PlantProblems[]; 
       return (
         <div className="bg-white p-2 border border-slate-200 rounded shadow-xl max-w-xs z-50 text-xs">
           <p className="font-bold text-slate-800 mb-1 text-xs">{label}</p>
           {payload.map((entry: any, index: number) => (
             <p key={index} style={{ color: entry.color }} className="text-xs flex items-center justify-between gap-2 mb-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: entry.color}}></span>
                  <span className="font-semibold">{entry.name}:</span> 
                </span>
                <span>{Number(entry.value).toFixed(1)} MWh</span>
             </p>
           ))}
           <div className="mt-1 pt-1 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs text-slate-500">Performance:</span>
              <span className={`text-xs font-bold ${
                 dataPoint.performance >= 100 ? 'text-indigo-600' : 
                 dataPoint.performance >= 80 ? 'text-amber-500' : 'text-red-500'
              }`}>
                 {dataPoint.performance.toFixed(1)}%
              </span>
           </div>
           {problems && problems.length > 0 && (
              <div className="mt-1 pt-1 border-t border-slate-200 bg-red-50 -mx-2 -mb-2 p-2 rounded-b">
                 <p className="text-xs font-bold text-red-600 mb-1">Ocorrências ({problems.length})</p>
                 <div className="flex flex-col gap-1">
                   {problems.slice(0, 3).map((prob, idx) => (
                     <div key={idx} className="bg-white border border-red-100 p-1 rounded text-xs">
                        <span className="font-bold text-[10px] mr-1">[{prob.name}]</span>
                       <p className="font-medium text-slate-700 leading-tight inline">
                         {typeof prob.cause === 'string' ? prob.cause.substring(0, 30) : 'Erro'}...
                       </p>
                     </div>
                   ))}
                 </div>
              </div>
           )}
         </div>
       );
     }
     return null;
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-100 text-gray-500">Carregando dados...</div>;

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-3 overflow-hidden">
      <div className="h-full flex flex-col gap-2">
        
        {/* Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-white rounded-lg shadow px-4 py-3 gap-3">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"/></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 leading-tight">Performance</h1>
              <p className="text-xs text-gray-500">
                  {selectedPlants.length > 0 ? `${selectedPlants.length} Usina(s) Selecionada(s)` : (selectedState === 'ALL' ? 'Visão Geral Portfolio' : 'Todas as Usinas Filtradas')}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Year & Month */}
            <div className="bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
                <span className="text-[10px] text-gray-400 font-bold block leading-none">ANO</span>
                <select 
                    className="text-sm font-bold text-gray-700 bg-transparent outline-none cursor-pointer"
                    value={selectedYear}
                    onChange={(e) => { setSelectedYear(e.target.value); setSelectedMonth('ALL'); }}
                >
                    <option value="ALL">Todos</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            <div className="bg-white border border-blue-200 rounded-lg px-2 py-1 shadow-sm border-l-4 border-l-blue-500">
                <span className="text-[10px] text-blue-400 font-bold block leading-none">MÊS</span>
                <select 
                    className="text-sm font-bold text-blue-700 bg-transparent outline-none cursor-pointer min-w-[80px]"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                >
                    <option value="ALL">Todos</option>
                    {availableMonths.map(m => <option key={m} value={m}>{MONTH_MAP[m] || m}</option>)}
                </select>
            </div>
            
            <div className="border-l border-gray-300 h-6 mx-1"></div>

            {/* Filters */}
            <select 
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2"
                value={selectedState}
                onChange={(e) => { setSelectedState(e.target.value); setSelectedComplex('ALL'); setSelectedPlants([]); }}
            >
                <option value="ALL">Todos Estados</option>
                {uniqueStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>

            <select 
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2"
                value={selectedComplex}
                onChange={(e) => { setSelectedComplex(e.target.value); setSelectedPlants([]); }}
            >
                <option value="ALL">Todos Complexos</option>
                {uniqueComplexes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setViewType('actual')} className={`px-2 py-1 rounded text-xs ${viewType === 'actual' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>Real</button>
              <button onClick={() => setViewType('expected')} className={`px-2 py-1 rounded text-xs ${viewType === 'expected' ? 'bg-purple-600 text-white' : 'text-gray-600'}`}>P50</button>
              <button onClick={() => setViewType('both')} className={`px-2 py-1 rounded text-xs ${viewType === 'both' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'text-gray-600'}`}>Ambos</button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 grid grid-cols-12 gap-2 overflow-hidden">
          
          {/* Stats Bar */}
          <div className="col-span-12 md:col-span-2 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-hidden pb-2 md:pb-0">
            {stats && (
              <>
                <div className="bg-white rounded-lg shadow p-3 min-w-[140px] flex-1">
                  <p className="text-xs text-gray-500">Geração Total</p>
                  <p className="text-xl font-bold text-blue-600">{stats.totalActual.toFixed(1)} <span className="text-xs">MWh</span></p>
                </div>
                <div className="bg-white rounded-lg shadow p-3 min-w-[140px] flex-1">
                  <p className="text-xs text-gray-500">Esperado P50</p>
                  <p className="text-xl font-bold text-purple-600">{stats.totalExpected.toFixed(1)} <span className="text-xs">MWh</span></p>
                </div>
                <div className="bg-white rounded-lg shadow p-3 min-w-[140px] flex-1">
                  <p className="text-xs text-gray-500">Performance</p>
                  <p className={`text-xl font-bold ${stats.avgPerformance >= 100 ? 'text-green-600' : 'text-red-500'}`}>{stats.avgPerformance.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-lg shadow p-3 min-w-[140px] flex-1">
                  <p className="text-xs text-gray-500">Disp. Geral</p>
                  <p className={`text-xl font-bold ${stats.generalAvailability >= 98 ? 'text-green-600' : 'text-red-500'}`}>{stats.generalAvailability.toFixed(2)}%</p>
                </div>
              </>
            )}
          </div>

          {/* Plant Selector List (Availability Ranking) - NOW INTERACTIVE */}
          <div className="col-span-12 md:col-span-2 bg-white rounded-lg shadow p-3 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                Usinas
                </h2>
                {selectedPlants.length > 0 && (
                    <button 
                        onClick={() => setSelectedPlants([])}
                        className="text-[10px] text-blue-600 hover:underline"
                    >
                        Limpar Seleção
                    </button>
                )}
            </div>

            {(() => {
              // Note: We use availablePlantsList (filtered by State/Complex) to populate this list
              // We do NOT filter by selectedPlants here, otherwise items would disappear when unchecked.
              
              const plantAvailabilities = availablePlantsList.map(plant => {
                // Filter problems for this specific plant (to calculate its individual availability)
                const plantProblems = problems.filter(p => {
                    if (p.name !== plant.name) return false;
                    
                    // Respect time filters for availability calc
                    const probDate = p.when instanceof Date ? p.when.toISOString().substring(0, 10) : String(p.when).substring(0, 10);
                    const probYear = probDate.substring(0, 4);
                    const probMonth = probDate.substring(5, 7);
                    if (selectedYear !== 'ALL' && probYear !== selectedYear) return false;
                    if (selectedMonth !== 'ALL' && probMonth !== selectedMonth) return false;
                    return true;
                });
                
                // Total hours in period (approximate based on current filter context)
                // If specific month selected: Days in month * 24. If ALL: Total days in dataset * 24
                const hoursCalc = chartData.length > 0 ? chartData.length * 24 : 720; 
                
                let totalDowntime = 0;
                plantProblems.forEach(prob => totalDowntime += parseDurationToHours(prob.duration));
                
                const availability = hoursCalc > 0 ? ((hoursCalc - totalDowntime) / hoursCalc) * 100 : 100;
                
                return { name: plant.name, availability };
              })
              .filter((v, i, a) => a.findIndex(t => t.name === v.name) === i)
              .sort((a, b) => b.availability - a.availability);

              return (
                <div className="overflow-y-auto flex-1 pr-1">
                  {plantAvailabilities.length > 0 ? (
                    <div className="space-y-1">
                      {plantAvailabilities.map((plant, idx) => {
                        const isSelected = selectedPlants.includes(plant.name);
                        return (
                            <button
                                key={idx}
                                onClick={() => togglePlantSelection(plant.name)}
                                className={`w-full flex items-center gap-2 p-1.5 rounded transition-all border ${
                                    isSelected 
                                    ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' 
                                    : 'bg-white border-transparent hover:bg-slate-50'
                                }`}
                            >
                                {/* Checkbox Indicator */}
                                <div className={`w-3 h-3 rounded border flex items-center justify-center ${
                                    isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                                }`}>
                                    {isSelected && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                </div>

                                <div className="flex-1 min-w-0 text-left">
                                    <p className={`text-[10px] font-medium truncate leading-tight ${isSelected ? 'text-blue-700' : 'text-slate-700'}`} title={plant.name}>
                                    {plant.name}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div className={`h-full ${getAvailabilityColor(plant.availability)}`} style={{ width: `${plant.availability}%` }} />
                                    </div>
                                    <span className={`text-[9px] font-bold min-w-[32px] text-right ${plant.availability >= 98 ? 'text-green-600' : 'text-red-600'}`}>
                                        {plant.availability.toFixed(1)}%
                                    </span>
                                </div>
                            </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-500">Nenhuma usina encontrada</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Middle Column - Charts */}
          <div className="col-span-12 md:col-span-5 flex flex-col gap-2">
            <div className="bg-white rounded-lg shadow p-3 flex-1 min-h-[250px] flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Timeline de Geração</h2>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tickFormatter={(val) => val.substring(8)} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                    {(viewType === 'expected' || viewType === 'both') && <Line type="monotone" dataKey="expected" stroke="#a855f7" strokeWidth={2} dot={false} name="Esperado (P50)" />}
                    {(viewType === 'actual' || viewType === 'both') && <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorActual)" name="Atual" dot={<ProblemDot />} />}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-3 h-48 flex flex-col">
               <h2 className="text-sm font-bold text-slate-800 mb-2">Performance Diária (%)</h2>
               <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tickFormatter={(val) => val.substring(8)} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ fontSize: '11px' }} formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)}%`, 'Performance'] : ['N/A', 'Performance']} />
                      <Bar dataKey="performance" radius={[3, 3, 0, 0]} name="Performance">
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getPerformanceColor(entry.performance)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </div>

          {/* Right Column - Problems Table */}
          <div className="col-span-12 md:col-span-3 bg-white rounded-lg shadow p-3 overflow-hidden flex flex-col min-h-[300px]">
             <h2 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Ocorrências ({filteredProblems.length})
             </h2>
             <div className="overflow-y-auto flex-1 space-y-2">
                 {filteredProblems.map(prob => (
                     <div key={prob.id} className="border border-slate-200 rounded p-2 text-xs">
                         <div className="flex justify-between">
                            <span className="text-slate-500">{new Date(prob.when).toLocaleDateString()}</span>
                            <span className="font-bold text-red-600">{typeof prob.duration === 'number' ? (prob.duration*24).toFixed(1)+'h' : String(prob.duration)}</span>
                         </div>
                         <div className="font-bold text-blue-700">{prob.name}</div>
                         <div className="text-slate-700">{typeof prob.cause === 'string' ? prob.cause : 'N/A'}</div>
                     </div>
                 ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PlantPerformanceVisualization;