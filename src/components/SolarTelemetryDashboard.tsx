import { useState, useEffect, useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import * as XLSX from 'xlsx';
import { parseDurationToHours, transformDashboardData, transformPlantRegistry, transformProblemLogs } from '../utils/dataCleaner';

// --- Interfaces ---
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

const PLANT_COLORS = [
  '#0047AB', '#4CAF50', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
];

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

const SolarTelemetryDashboard = () => {
  // --- State Definitions ---
  const [registry, setRegistry] = useState<PlantMetadata[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [problems, setProblems] = useState<PlantProblems[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedComplex, setSelectedComplex] = useState<string>('ALL');
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string[]>([]); 

  const GERACAO_URL = "/data/CONTROLE DE Geração 03_2026_MARÇO.xlsm";
  const OCORRENCIAS_URL = "/data/022026_Geração_Disponibilidade_REV00_ajustes.xlsx";
  const METADATA_URL = '/data/Inversores_REV11_BC_Brasol.xlsx';

  useEffect(() => {
    loadExcelData();
  }, []);

const loadExcelData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Metadata Workbook
      const resMeta = await fetch(METADATA_URL);
      const wbMeta = XLSX.read(await resMeta.arrayBuffer(), { type: 'array' });

      // 2. Fetch Generation/Capacity Workbook
      const resGen = await fetch(GERACAO_URL);
      const wbGen = XLSX.read(await resGen.arrayBuffer(), { type: 'array' });
      
      // 3. Pass BOTH workbooks to the updated registry function
      setRegistry(transformPlantRegistry(wbMeta, wbGen));

      // 4. Transform remaining data
      const genData = transformDashboardData(wbGen);
      setData(genData);
      
      if (genData.length > 0) {
        setSelectedYear(genData[0].DIA.substring(0, 4));
        setSelectedMonth([genData[0].DIA.substring(5, 7)]);
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
  
  const totalCapacity = useMemo(() => {
    return availablePlantsList
      .filter(p => activePlantNames.includes(p.name))
      .reduce((sum, plant) => sum + (plant.capacity || 0), 0);
  }, [availablePlantsList, activePlantNames]);

  const togglePlantSelection = (plantName: string) => {
    setSelectedPlants(prev => 
      prev.includes(plantName) ? prev.filter(p => p !== plantName) : [...prev, plantName]
    );
  };

  const filteredDataByMonth = useMemo(() => {
    let filtered = data;

    if (selectedYear !== 'ALL') {
      filtered = filtered.filter(d => d.DIA.startsWith(selectedYear));
    }
    
    if (selectedMonth.length > 0) {
        filtered = filtered.filter(d => selectedMonth.includes(d.DIA.substring(5, 7)));
    }

    filtered = filtered.filter(d => {
      const year = parseInt(d.DIA.substring(0, 4));
      const month = parseInt(d.DIA.substring(5, 7));
      const day = parseInt(d.DIA.substring(8, 10));
      const maxDaysInThisMonth = new Date(year, month, 0).getDate();
      return day <= maxDaysInThisMonth;
    });

    return filtered;
  }, [data, selectedYear, selectedMonth]);

  const filteredProblems = useMemo(() => {
    const filtered = problems.filter(p => {
        if (!activePlantNames.includes(p.name)) return false;
        const probDate = p.when instanceof Date ? p.when.toISOString().substring(0, 10) : String(p.when).substring(0, 10);
        const probYear = probDate.substring(0, 4);
        const probMonth = probDate.substring(5, 7);
        
        if (selectedYear !== 'ALL' && probYear !== selectedYear) return false;
        if (selectedMonth.length > 0 && !selectedMonth.includes(probMonth)) return false;
        
        return true;
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.when).getTime();
      const dateB = new Date(b.when).getTime();
      return dateB - dateA; 
    });
  }, [problems, activePlantNames, selectedYear, selectedMonth]);

  const chartData = useMemo(() => {
    if (filteredDataByMonth.length === 0) return { dates: [], series: [] };

    const dateMap = new Map<string, any>();
    filteredDataByMonth.forEach(day => {
      if (dateMap.has(day.DIA)) return;

      const dayProblems = filteredProblems.filter(p => {
        const probDate = p.when instanceof Date
          ? p.when.toISOString().split('T')[0]
          : String(p.when).split(' ')[0];
        return probDate === day.DIA;
      });

      const entry: any = {
        date: day.DIA,
        problems: dayProblems,
        hasProblem: dayProblems.length > 0,
      };

      let dailyTotal = 0;

      // Keep mapping individual plants so the `stats` useMemo still works
      activePlantNames.forEach(plantName => {
        const metrics = day.plants[plantName];
        const actual = metrics ? metrics.actual : 0;
        entry[plantName] = actual;
        entry[`${plantName}_expected`] = metrics ? metrics.expected : 0;
        dailyTotal += actual;
      });

      // Add the sum for the consolidated view
      entry['Total'] = dailyTotal;

      dateMap.set(day.DIA, entry);
    });

    const dates = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    
    // Conditionally render the series based on user selection
    let series = [];
    if (selectedPlants.length === 0) {
      series = [{
        name: 'Total Consolidado',
        color: '#0047AB', // Primary blue for the total line
        dataKey: 'Total'
      }];
    } else {
      series = selectedPlants.map((name, idx) => ({
        name,
        color: PLANT_COLORS[idx % PLANT_COLORS.length],
        dataKey: name,
      }));
    }

    return { dates, series };
  }, [filteredDataByMonth, activePlantNames, filteredProblems, selectedPlants]);

  // --- UPDATED: stats now uses chartData.dates ---
  const stats = useMemo(() => {
    if (chartData.dates.length === 0) return null;

    let totalActual = 0, totalExpected = 0;
    chartData.dates.forEach(d => {
      activePlantNames.forEach(name => {
        totalActual += d[name] ?? 0;
        totalExpected += d[`${name}_expected`] ?? 0;
      });
    });

    const avgPerformance = totalExpected > 0 ? (totalActual / totalExpected) * 100 : 0;
    const totalPeriodHours = chartData.dates.length * 24 * activePlantNames.length;
    let generalDowntimeHours = 0, technicalDowntimeHours = 0;

    filteredProblems.forEach(prob => {
      const hours = parseDurationToHours(prob.duration);
      generalDowntimeHours += hours;
      const resolution = prob.resolution ? prob.resolution.toString().trim().toLowerCase() : '';
      if (resolution !== 'distribuidora') technicalDowntimeHours += hours;
    });

    const generalAvail = totalPeriodHours > 0
      ? ((totalPeriodHours - generalDowntimeHours) / totalPeriodHours) * 100
      : 0;
    const technicalAvail = totalPeriodHours > 0
      ? ((totalPeriodHours - technicalDowntimeHours) / totalPeriodHours) * 100
      : 0;

    return { totalActual, totalExpected, avgPerformance, generalAvailability: generalAvail, technicalAvailability: technicalAvail };
  }, [chartData, activePlantNames, filteredProblems]);


  // --- UPDATED TOOLTIP ---
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
           
           {/* DETAILED PROBLEM LIST */}
           {problems?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-red-100">
                 <p className="text-[10px] font-bold text-red-700 mb-1">⚠️ Ocorrências ({problems.length})</p>
                 <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                   {problems.map((p, idx) => (
                     <div key={idx} className="text-[9px] text-red-600 flex flex-col border-b border-red-50 last:border-0 pb-1 last:pb-0">
                        <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-gray-700">{p.name}</span>
                            <span className="font-bold bg-red-50 px-1.5 py-0.5 rounded text-red-700">{p.duration}</span>
                        </div>
                        <span className="text-gray-500 italic leading-tight">{p.cause}</span>
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

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-xl font-semibold text-gray-600">Carregando dados...</div>
    </div>
  );

  return (
    <div className="w-screen h-screen bg-gray-200 flex flex-col overflow-hidden font-sans">

      {/* COMBINED HEADER */}
      <div className="bg-[#013278] border-b border-blue-800 h-28 shrink-0 shadow-md z-20 flex items-center w-full px-10 transition-all duration-300 pl-20">
        
        {/* Left Side: Brand/Logo */}
        <div className="w-[37.5%] flex items-center gap-6 group cursor-pointer pr-8 pl-10">
          <img 
            src="OEM_Logo_Transparente_1080px.png" 
            alt="Company Logo" 
            className="h-20 w-auto object-contain hover:scale-105 transition-transform duration-300 drop-shadow-md brightness-0 invert"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-3xl font-black text-white leading-none uppercase tracking-tighter group-hover:text-blue-200 transition-colors">
              O&M SOLAR <span className="text-[#4CAF50]">| KPI'S</span>
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-[11px] text-blue-100 font-bold uppercase tracking-[0.25em]">Dashboard</p>
            </div>
          </div>
        </div>

        {/* Right Side: KPIs */}
        <div className="w-[62.5%] flex items-center justify-start gap-4 h-full py-6 pl-65 overflow-x-auto custom-scrollbar">
          
          {/* KPI CARD 1: USINAS & GERAÇÃO */}
          <div className="bg-white rounded-xl shadow-xl px-5 py-2 flex items-center justify-center gap-6 h-full min-w-[220px] shrink-0 transition-transform hover:-translate-y-0.5">
            <div className="flex flex-col items-center">
               <span className="text-3xl font-bold text-[#0047AB] leading-none">{activePlantNames.length}</span>
               <span className="text-[10px] text-gray-500 font-bold uppercase mt-1">Usinas</span>
            </div>
            <div className="w-1 h-8 bg-[#4CAF50] rounded-full shrink-0 opacity-20"></div>
            <div className="flex flex-col items-center">
               <span className="text-3xl font-bold text-[#0047AB] leading-none">{stats?.totalActual.toFixed(2) ?? '0.00'}</span>
               <span className="text-[10px] text-gray-500 font-bold mt-1">MWh</span>
            </div>
          </div>

          {/* KPI CARD 2: CAPACIDADE INSTALADA */}
          <div className="bg-white rounded-xl shadow-xl px-4 py-2 flex items-center gap-3 h-full w-48 shrink-0 transition-transform hover:-translate-y-0.5">
            <div className="w-1 h-8 bg-[#f59e0b] rounded-full shrink-0 opacity-20"></div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-black leading-none">
                {(totalCapacity / 1000).toFixed(2)}
              </span>
              <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase">MWp.</span>
            </div>
          </div>

          {/* KPI CARD 3: DISP GLOBAL */}
          <div className="bg-white rounded-xl shadow-xl px-4 py-2 flex items-center gap-3 h-full w-48 shrink-0 transition-transform hover:-translate-y-0.5">
            <div className="w-1 h-8 bg-[#0047AB] rounded-full shrink-0 opacity-20"></div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-black leading-none">
                {stats?.generalAvailability.toFixed(2) ?? '0.00'}%
              </span>
              <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase">Disp. Global</span>
            </div>
          </div>

          {/* KPI CARD 4: DISP TÉCNICA */}
          <div className="bg-white rounded-xl shadow-xl px-4 py-2 flex items-center gap-3 h-full w-48 shrink-0 transition-transform hover:-translate-y-0.5">
            <div className="w-1 h-8 bg-[#4CAF50] rounded-full shrink-0 opacity-20"></div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-black leading-none">
                {stats?.technicalAvailability.toFixed(2) ?? '0.00'}%
              </span>
              <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase">Disp. Técnica</span>
            </div>
          </div>

          {/* KPI CARD 5: PERFORMANCE */}
          <div className="bg-white rounded-xl shadow-xl px-4 py-2 flex items-center gap-3 h-full w-48 shrink-0 transition-transform hover:-translate-y-0.5">
            <div className="w-1 h-8 bg-[#0047AB] rounded-full shrink-0 opacity-20"></div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-black leading-none">
                {stats?.avgPerformance.toFixed(2) ?? '0.00'}%
              </span>
              <span className="text-[10px] text-gray-500 font-medium mt-1 uppercase">Performance</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        <div className="flex-1 flex min-h-0 p-4 gap-4 overflow-hidden pl-10 pr-10">

          {/* COLUMN 1: Filters */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-4">
              
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-500 uppercase ml-1">UF</label>
                <div className="relative">
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-black outline-none appearance-none shadow-sm focus:border-[#0047AB] transition-colors"
                    value={selectedState}
                    onChange={(e) => { setSelectedState(e.target.value); setSelectedComplex('ALL'); setSelectedPlants([]); }}
                  >
                    <option value="ALL">Todos</option>
                    {uniqueStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-500 uppercase ml-1">UFV</label>
                <div className="relative">
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-black outline-none appearance-none shadow-sm focus:border-[#0047AB] transition-colors"
                    value={selectedComplex}
                    onChange={(e) => { setSelectedComplex(e.target.value); setSelectedPlants([]); }}
                  >
                    <option value="ALL">Todos</option>
                    {uniqueComplexes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-500 uppercase ml-1">ANO</label>
                <div className="relative">
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-black outline-none appearance-none shadow-sm focus:border-[#0047AB] transition-colors"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    <option value="ALL">Todos</option>
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase">MÊS</label>
                  {selectedMonth.length > 0 && (
                    <button 
                      onClick={() => setSelectedMonth([])}
                      className="text-[8px] font-bold text-[#0047AB] hover:underline uppercase"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availableMonths.map(m => {
                    const isSelected = selectedMonth.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          if (isSelected) {
                              setSelectedMonth(selectedMonth.filter(month => month !== m));
                          } else {
                              setSelectedMonth([...selectedMonth, m]);
                          }
                        }}
                        className={`px-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all border ${
                          isSelected 
                            ? 'bg-[#0047AB] border-[#0047AB] text-white shadow-md' 
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 shadow-sm'
                        }`}
                      >
                        {MONTH_MAP[m] || m}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>  

          {/* COLUMN 2: Plant Performance List */}
          <div className="flex-[2] bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Usinas</h2>
              {selectedPlants.length > 0 && (
                <button onClick={() => setSelectedPlants([])} className="text-[9px] font-bold text-[#0047AB] underline">Reset</button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {availablePlantsList
                .map(plant => {
                  const plantProblems = problems.filter(p => {
                    if (p.name !== plant.name) return false;
                    const probDate = p.when instanceof Date ? p.when.toISOString().substring(0, 10) : String(p.when).substring(0, 10);
                    const probYear = probDate.substring(0, 4);
                    const probMonth = probDate.substring(5, 7);
                    if (selectedYear !== 'ALL' && probYear !== selectedYear) return false;
                    if (selectedMonth.length > 0 && !selectedMonth.includes(probMonth)) return false;
                    return true;
                  });
                  const hoursCalc = chartData.dates.length > 0 ? chartData.dates.length * 24 : 720;
                  let totalDowntime = 0;
                  plantProblems.forEach(prob => totalDowntime += parseDurationToHours(prob.duration));
                  const availability = hoursCalc > 0 ? Math.min(100, ((hoursCalc - totalDowntime) / hoursCalc) * 100) : 100;
                  return { ...plant, availability };
                })
                .sort((a, b) => b.availability - a.availability)
                .map((plant, idx) => {
                  const isSelected = selectedPlants.includes(plant.name);
                  const barColor = plant.availability >= 98 ? 'bg-[#4CAF50]' : (plant.availability >= 95 ? 'bg-yellow-400' : 'bg-red-500');
                  const textColor = isSelected ? 'text-white' : (plant.availability >= 98 ? 'text-[#4CAF50]' : (plant.availability >= 95 ? 'text-yellow-600' : 'text-red-600'));
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => togglePlantSelection(plant.name)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all border ${
                        isSelected ? 'bg-[#0047AB] border-[#0047AB] shadow-md scale-[1.01]' : 'bg-gray-50 border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-left flex-1 mr-3">
                        <p className={`text-[9px] font-black uppercase mb-1 ${isSelected ? 'text-white' : 'text-black'}`}>
                          {plant.name}
                        </p>
                        <div className={`h-1 w-full rounded-full ${isSelected ? 'bg-blue-400' : 'bg-gray-200'}`}>
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${plant.availability}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-[10px] font-black shrink-0 ${textColor}`}>
                        {plant.availability.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* COLUMN 3: Timeline Graph — one line per plant */}
          <div className="flex-[5] bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Histórico de Geração</h2>
              {/* Dynamic legend — one badge per active plant */}
              <div className="flex gap-3 flex-wrap justify-end">
                {chartData.series.map(s => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[9px] font-bold text-gray-500 uppercase">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.dates} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#cbd5e1', fontSize: 9 }}
                    tickFormatter={(v) => v.substring(8, 10)}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                  <Tooltip content={<CustomTooltip />} />
                  {chartData.series.map(s => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.dataKey}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={<ProblemDot />}
                      activeDot={{ r: 6, fill: s.color, stroke: 'white', strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bottom Observation Section */}
        <div className="h-80 shrink-0 p-4 pt-0 pl-10 pr-10 pb-10">
          <div className="h-full flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ocorrências Detalhadas</h2>
              </div>
              <button className="text-[9px] font-bold text-gray-400 hover:text-gray-600 transition-colors">Ver todas</button>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                  <tr className="text-[9px] font-black text-gray-400 uppercase border-b border-gray-100">
                    <th className="px-3 py-3 bg-white">Início</th>
                    <th className="px-3 py-3 bg-white">Duração</th>
                    <th className="px-3 py-3 bg-white">Equipamento</th>
                    <th className="px-3 py-3 bg-white">Observação</th>
                    <th className="px-3 py-3 text-center bg-white">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProblems.map((prob, i) => (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors group cursor-default">
                      <td className="px-3 py-3 text-[10px] font-bold text-gray-500">
                        {prob.when instanceof Date ? prob.when.toLocaleDateString('pt-BR') : String(prob.when).substring(0, 10)}
                      </td>
                      <td className="px-3 py-3 text-[10px] font-black text-black">{prob.duration}</td>
                      
                      {/* EQUIPMENT COLUMN */}
                      <td className="px-3 py-3">
                         <div className="relative flex items-center" title={prob.equipamentos?.join(', ') || ''}>
                             <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {prob.equipamentos && prob.equipamentos.length > 0 ? (
                                    <>
                                        <span className="px-1.5 py-0.5 bg-blue-50 text-[#0047AB] rounded text-[9px] font-bold border border-blue-100 uppercase truncate max-w-[80px]">
                                            {prob.equipamentos[0]}
                                        </span>
                                        {prob.equipamentos.length > 1 && (
                                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-bold border border-gray-200">
                                                +{prob.equipamentos.length - 1}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-gray-400 text-[10px]">-</span>
                                )}
                             </div>
                         </div>
                      </td>

                      <td className="px-3 py-3 text-[10px] text-gray-500 italic max-w-xs truncate">{prob.cause}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          prob.status === 'Concluido' ? 'bg-[#E8F5E9] text-[#4CAF50]' : 'bg-red-100 text-red-700'
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
  );
};

export default SolarTelemetryDashboard;