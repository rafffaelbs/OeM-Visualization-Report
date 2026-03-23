import { useState, useEffect, useMemo } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line, Legend, PieChart, Pie, Cell} from 'recharts';
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


const GenerationVsExpectationChart = () => {
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

  const plantBarData = useMemo(() => {
    if (filteredDataByMonth.length === 0) return [];

    const aggregated: Record<string, { name: string; actual: number; expected: number }> = {};

    activePlantNames.forEach(name => {
      aggregated[name] = { name, actual: 0, expected: 0 };
    });

    // Step 1: Find the latest day in the dataset that actually has generation > 0
    // This prevents summing "Expected" values for future days.
    let lastValidDay = "";
    filteredDataByMonth.forEach(day => {
      let hasGeneration = false;
      // Check all plants to see if the O&M team inputted ANY data for this day
      Object.values(day.plants).forEach(metrics => {
        if (metrics.actual > 0) hasGeneration = true;
      });
      if (hasGeneration && day.DIA > lastValidDay) {
        lastValidDay = day.DIA;
      }
    });

    // Step 2: Only sum up actual and expected for days <= the lastValidDay
    filteredDataByMonth.forEach(day => {
      if (day.DIA <= lastValidDay) {
        activePlantNames.forEach(plantName => {
          const metrics = day.plants[plantName];
          if (metrics) {
            aggregated[plantName].actual += metrics.actual || 0;
            aggregated[plantName].expected += metrics.expected || 0;
          }
        });
      }
    });

    // Step 3: Calculate difference and sort by performance
    return Object.values(aggregated).map(plant => {
      const difference = plant.expected > 0 
        ? ((plant.actual - plant.expected) / plant.expected) * 100 
        : 0;
      return { 
        ...plant, 
        difference: Number(difference.toFixed(2)) 
      };
    }).sort((a, b) => b.difference - a.difference); 
  }, [filteredDataByMonth, activePlantNames]);

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

  // --- NEW: Calculate Achievement Percentages for Gauges ---
  const progressStats = useMemo(() => {
    if (filteredDataByMonth.length === 0) return { percentageFullMonth: 0, percentageToDate: 0 };

    let totalActual = 0;
    let totalExpectedFullMonth = 0;
    let totalExpectedToDate = 0;

    // 1. Find the latest day in the filtered dataset that has any actual generation > 0
    let lastValidDay = "";
    filteredDataByMonth.forEach(day => {
      let hasGeneration = false;
      Object.values(day.plants).forEach(metrics => {
        if (metrics.actual > 0) hasGeneration = true;
      });
      if (hasGeneration && day.DIA > lastValidDay) {
        lastValidDay = day.DIA;
      }
    });

    // 2. Sum up the values
    filteredDataByMonth.forEach(day => {
      activePlantNames.forEach(plantName => {
        const metrics = day.plants[plantName];
        if (metrics) {
          totalActual += metrics.actual || 0;
          totalExpectedFullMonth += metrics.expected || 0;

          // Only add to "To Date" expected if the day is <= the last valid day
          if (day.DIA <= lastValidDay) {
            totalExpectedToDate += metrics.expected || 0;
          }
        }
      });
    });

    const percentageFullMonth = totalExpectedFullMonth > 0 ? (totalActual / totalExpectedFullMonth) * 100 : 0;
    const percentageToDate = totalExpectedToDate > 0 ? (totalActual / totalExpectedToDate) * 100 : 0;

    return {
      percentageFullMonth: Number(percentageFullMonth.toFixed(1)),
      percentageToDate: Number(percentageToDate.toFixed(1)),
    };
  }, [filteredDataByMonth, activePlantNames]);

  
// --- NEW: Reusable Gauge Component ---
// --- NEW: Modernized Gauge Component ---
const Gauge = ({ value, label, color }: { value: number, label: string, color: string }) => {
  const chartValue = Math.min(Math.max(value, 0), 100);
  const data = [
    { name: 'progress', value: chartValue },
    { name: 'remainder', value: 100 - chartValue },
  ];

  return (
    <div className="flex flex-col items-center justify-center pt-2">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">{label}</span>
      
      <div className="relative" style={{ width: 120, height: 60 }}> 
        <PieChart width={120} height={60}>
          {/* Background Track - Added cornerRadius for modern look */}
          <Pie
            data={[{ value: 100 }]}
            dataKey="value"
            cx={60} 
            cy={60} 
            startAngle={180}
            endAngle={0}
            innerRadius={36}
            outerRadius={50} 
            fill="#f1f5f9" // Lighter slate track
            stroke="none"
            isAnimationActive={false}
            cornerRadius={40} // Makes the ends perfectly rounded
          />
          {/* Progress Bar - Added cornerRadius */}
          <Pie
            data={data}
            dataKey="value"
            cx={60}
            cy={60}
            startAngle={180}
            endAngle={0}
            innerRadius={36}
            outerRadius={50}
            stroke="none"
            cornerRadius={40} // Makes the ends perfectly rounded
          >
            <Cell key="progress" fill={color} />
            <Cell key="remainder" fill="transparent" />
          </Pie>
        </PieChart>
        
        {/* Centered Percentage Text */}
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-[16px] font-black text-slate-800 leading-none">
            {value.toFixed(1)}%
          </span>
        </div>
      </div>
      
      {/* Min/Max Labels */}
      <div className="flex justify-between w-full px-3 mt-1.5" style={{ maxWidth: 120 }}>
        <span className="text-[9px] font-bold text-slate-400">0%</span>
        <span className="text-[9px] font-bold text-slate-400">100%</span>
      </div>
    </div>
  );
};
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="text-xl font-semibold text-gray-600">Carregando dados...</div>
    </div>
  );

  return (
    <div className="w-screen h-screen bg-gray-200 flex flex-col overflow-hidden font-sans">

{/* COMBINED HEADER (Slimmed Down) */}
      <div className="bg-[#013278] border-b border-blue-800 h-20 shrink-0 shadow-md z-20 flex items-center w-full px-10 transition-all duration-300">
        <div className="flex items-center gap-6 group cursor-pointer pl-10">
          <img 
            src="OEM_Logo_Transparente_1080px.png" 
            alt="Company Logo" 
            className="h-12 w-auto object-contain hover:scale-105 transition-transform duration-300 drop-shadow-md brightness-0 invert"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-2xl font-black text-white leading-none uppercase tracking-tighter group-hover:text-blue-200 transition-colors">
              O&M SOLAR <span className="text-[#4CAF50]">| KPI'S</span>
            </h1>
            <div className="flex items-center mt-1">
              <p className="text-[10px] text-blue-100 font-bold uppercase tracking-[0.25em]">Dashboard</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-100 p-4 pl-10 pr-10">
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">

          {/* ROW 1: Filters | Gauges | KPIs (Perfectly Centered) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-row items-center justify-between gap-6 shrink-0 w-full overflow-x-auto custom-scrollbar">
              
              {/* 1. FILTERS BLOCK (Cramped) */}
              <div className="flex flex-row items-center gap-3 shrink-0">
                <div className="flex flex-col gap-1 w-20 shrink-0">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">UF</label>
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-black outline-none shadow-sm focus:border-[#0047AB]"
                    value={selectedState}
                    onChange={(e) => { setSelectedState(e.target.value); setSelectedComplex('ALL'); setSelectedPlants([]); }}
                  >
                    <option value="ALL">Todos</option>
                    {uniqueStates.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-32 shrink-0">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">UFV</label>
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-black outline-none shadow-sm focus:border-[#0047AB]"
                    value={selectedComplex}
                    onChange={(e) => { setSelectedComplex(e.target.value); setSelectedPlants([]); }}
                  >
                    <option value="ALL">Todos</option>
                    {uniqueComplexes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1 w-24 shrink-0">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">ANO</label>
                  <select 
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-black outline-none shadow-sm focus:border-[#0047AB]"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    <option value="ALL">Todos</option>
                    {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 min-w-[200px] shrink-0">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-gray-500 uppercase">MÊS</label>
                    {selectedMonth.length > 0 && (
                      <button onClick={() => setSelectedMonth([])} className="text-[8px] font-bold text-[#0047AB] hover:underline uppercase">Limpar</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {availableMonths.map(m => {
                      const isSelected = selectedMonth.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            if (isSelected) setSelectedMonth(selectedMonth.filter(month => month !== m));
                            else setSelectedMonth([...selectedMonth, m]);
                          }}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                            isSelected ? 'bg-[#0047AB] border-[#0047AB] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {MONTH_MAP[m]?.substring(0, 3) || m} {/* Abbreviated to JAN, FEV, etc. */}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* VERTICAL DIVIDER */}
              <div className="w-px bg-gray-200 h-16 mx-1 shrink-0"></div>
              
              {/* 2. GAUGES BLOCK */}
              <div className="flex items-center gap-6 shrink-0">
                <Gauge 
                  value={progressStats.percentageFullMonth} 
                  label="Mês Completo" 
                  color="#0047AB" 
                />
                <Gauge 
                  value={progressStats.percentageToDate} 
                  label="Até Ontem" 
                  color="#4CAF50" 
                />
              </div>

              {/* VERTICAL DIVIDER */}
              <div className="w-px bg-gray-200 h-16 mx-1 shrink-0"></div>

              {/* 3. KPIs BLOCK (Modern, Flat, Centered) */}
              <div className="flex items-center gap-6 shrink-0 pr-4">
                
                <div className="flex flex-col items-center justify-center">
                   <span className="text-xl font-black text-[#0047AB] leading-none">{activePlantNames.length}</span>
                   <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">Usinas</span>
                </div>
                
                <div className="w-px h-10 bg-gray-200"></div>
                
                <div className="flex flex-col items-center justify-center">
                   <span className="text-xl font-black text-[#f59e0b] leading-none">{(totalCapacity / 1000).toFixed(2)}</span>
                   <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">MWp Inst.</span>
                </div>

                <div className="w-px h-10 bg-gray-200"></div>

                <div className="flex flex-col items-center justify-center">
                   <span className="text-xl font-black text-[#0047AB] leading-none">{stats?.totalActual.toFixed(2) ?? '0.00'}</span>
                   <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">MWh Gerado</span>
                </div>
                
                <div className="w-px h-10 bg-gray-200"></div>
                
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-800 leading-none">{stats?.generalAvailability.toFixed(2) ?? '0.00'}%</span>
                  <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">Disp. Global</span>
                </div>

                <div className="w-px h-10 bg-gray-200"></div>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-[#4CAF50] leading-none">{stats?.technicalAvailability.toFixed(2) ?? '0.00'}%</span>
                  <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">Disp. Técnica</span>
                </div>

                <div className="w-px h-10 bg-gray-200"></div>

                <div className="flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-800 leading-none">{stats?.avgPerformance.toFixed(2) ?? '0.00'}%</span>
                  <span className="text-[9px] text-gray-500 font-bold uppercase mt-1.5 tracking-wider">Performance</span>
                </div>
                
              </div>

          </div>
          {/* ROW 2: Comparative Chart (Overlapping Bars + Line) */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-[12px] font-black text-gray-400 uppercase tracking-widest">
                Geração vs Expectativa (Total por Usina)
              </h2>
            </div>
            
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={plantBarData} 
                  margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
                  barCategoryGap="40%"
                >
                  {/* Grid Lines Added Back Here - vertical is now true by default, and color is slightly darker */}
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} yAxisId="right"/>
                  
                  {/* Primary X-Axis (Visible) */}
                  <XAxis 
                    xAxisId="axis-expected"
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                    angle={-45}
                    textAnchor="end"
                    interval={0} 
                  />
                  
                  {/* Secondary X-Axis (Hidden) */}
                  <XAxis 
                    xAxisId="axis-actual"
                    dataKey="name" 
                    hide 
                  />

                  {/* Left Y-Axis (MWh) */}
                  <YAxis 
                    yAxisId="left"
                    orientation="left"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#cbd5e1', fontSize: 11 }}
                    tickFormatter={(val) => `${val} MWh`}
                  />

                  {/* Right Y-Axis (Percentage) */}
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    domain={[-100, 0]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#a855f7', fontSize: 11, fontWeight: 'bold' }}
                    tickFormatter={(val) => `${val}%`}
                  />

                  <Tooltip 
                    cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const plantName = payload[0].payload.name;
                        return (
                          <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-xl min-w-[150px]">
                            <p className="font-black text-slate-800 text-[11px] uppercase mb-2 border-b border-slate-100 pb-1">
                              {plantName}
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {payload.map((entry: any, index: number) => {
                                let textColor = '#64748b';
                                let formattedValue = entry.value;

                                if (entry.name === 'Esperado') {
                                  textColor = '#0047AB';
                                  formattedValue = `${Number(entry.value).toFixed(2)} MWh`;
                                } else if (entry.name === 'Gerado') {
                                  textColor = '#4CAF50';
                                  formattedValue = `${Number(entry.value).toFixed(2)} MWh`;
                                } else if (entry.name === 'Diferença') {
                                  textColor = '#a855f7'; 
                                  formattedValue = `${Number(entry.value).toFixed(2)}%`;
                                }

                                return (
                                  <div key={index} className="flex justify-between items-center gap-4 text-[10px]">
                                    <span style={{ color: textColor }} className="font-bold uppercase tracking-wider">
                                      {entry.name}:
                                    </span>
                                    <span className="font-black text-slate-700">
                                      {formattedValue}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}
                  />
                  
                  {/* Expected Generation - Outer Bar */}
                  <Bar 
                    yAxisId="left"
                    xAxisId="axis-expected"
                    dataKey="expected" 
                    name="Esperado" 
                    fill="#0047AB"
                    fillOpacity={0} 
                    stroke="#0047AB"
                    strokeDasharray="4 1"
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]} 
                    barSize={20} 
                  />
                  
                  {/* Actual Generation - Inner Bar */}
                  <Bar 
                    yAxisId="left"
                    xAxisId="axis-actual"
                    dataKey="actual" 
                    name="Gerado" 
                    fill="#4CAF50" 
                    radius={[4, 4, 0, 0]} 
                    barSize={18} 
                  />

                  {/* Percentage Difference - Purple Line */}
                  <Line 
                    yAxisId="right"
                    xAxisId="axis-expected" 
                    type="monotone" 
                    dataKey="difference" 
                    name="Diferença" 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    strokeDasharray="5 5" 
                    dot={false}
                    activeDot={{ r: 6, fill: '#a855f7', stroke: 'white', strokeWidth: 2 }}
                  />
                  
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};
export default GenerationVsExpectationChart;  
