import React, { useState, useEffect, useRef } from 'react';
import { Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, Line, LineChart } from 'recharts';
import * as XLSX from 'xlsx';
import { parseDurationToHours, transformDashboardData, transformProblemLogs } from '../utils/dataCleaner';
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

interface PlantMetrics {
  name: string;
  actual: number;
  expected: number;
  performance: number;
  problems: PlantProblems[];   // References the array of problems
}

interface DayData {
  DIA: string;
  plants: {
    [plantName: string]: PlantMetrics;
  };
}

const getAvailablePlants = (transformedData: DayData[]): string[] => {
  if (transformedData.length === 0) return [];
  return Object.keys(transformedData[0].plants);
};

// This renders a red dot only if the data point has a problem
const ProblemDot = (props: any) => {
  const { cx, cy, payload } = props;

  if (payload.hasProblem) {
    return (
      <g>
        {/* Outer glow/ring for visibility */}
        <circle cx={cx} cy={cy} r={6} fill="rgba(239, 68, 68, 0.3)" />
        {/* The solid red dot */}
        <circle cx={cx} cy={cy} r={3} fill="#ef4444" stroke="white" strokeWidth={1} />
      </g>
    );
  }
  return null; // Render nothing for normal days
};

const PlantPerformanceVisualization = () => {
  const [data, setData] = useState<DayData[]>([]);
  const [problems, setProblems] = useState<PlantProblems[]>([]); // NEW STATE
  const [selectedPlant, setSelectedPlant] = useState<string>('');
  const [availablePlants, setAvailablePlants] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState<'actual' | 'expected' | 'both'>('both');
  const printRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
   const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // URLs (Note: You had the same URL for both, ensure they are correct)
  const GERACAO_URL = "/data/CONTROLE DE Geração 01_2026_JANEIRO.xlsm";
  const OCORRENCIAS_URL = "/data/122025_Geração_Disponibilidade_REV00.xlsx";

  useEffect(() => {
    loadExcelData();
  }, []);

  const loadExcelData = async () => {
    setLoading(true);
    try {
      // 1. Load Generation Data
      const resGen = await fetch(GERACAO_URL);
      const bufGen = await resGen.arrayBuffer();
      const wbGen = XLSX.read(bufGen, { type: 'array' });
      const transformedGen = transformDashboardData(wbGen);
          
      // 2. Load Problems Data
      const resProb = await fetch(OCORRENCIAS_URL);
      const bufProb = await resProb.arrayBuffer();
      const wbProb = XLSX.read(bufProb, { type: 'array' });
      // FIX: Use the correct function here!
      const transformedProb = transformProblemLogs(wbProb);
      console.log("Raw Problems from Excel:", transformedProb); // CHECK THIS
      setProblems(transformedProb);
      
      setData(transformedGen);
      setProblems(transformedProb); // Save to state
      
      const plants = getAvailablePlants(transformedGen);
      setAvailablePlants(plants);
      if (plants.length > 0) setSelectedPlant(plants[0]);

    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };
  

  // Filter problems for the currently selected plant
  // const selectedPlantProblems = problems.filter(p => p.name === selectedPlant);
  const selectedPlantProblems = problems.filter(p => {
    const matches = p.name === selectedPlant;
    if (!matches && p.name.trim() === selectedPlant.trim()) {
      console.warn(`Potential mismatch: "${p.name}" vs "${selectedPlant}"`);
    }
    return matches;
  });

  console.log("Current Selected Plant:", selectedPlant);
  console.log("Available Plant Names in Problems:", [...new Set(problems.map(p => p.name))]);
  
const chartData = data.map(day => {
    // Check if any problem occurred on this specific day
  const hasProblem = selectedPlantProblems.some(p => {
      let probDateStr = '';
      if (p.when instanceof Date) {
          probDateStr = p.when.toISOString().split('T')[0];
      } else {
          probDateStr = String(p.when).split(' ')[0]; // Basic string handling
      }
      return probDateStr === day.DIA;
  });

  return {
          date: day.DIA,
          actual: selectedPlant ? day.plants[selectedPlant]?.actual || 0 : 0,
          expected: selectedPlant ? day.plants[selectedPlant]?.expected || 0 : 0,
          performance: selectedPlant ? day.plants[selectedPlant]?.performance || 0 : 0,
          hasProblem: hasProblem // We pass this boolean to the chart
      };
    });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border-2 border-gray-300 rounded-lg shadow-lg">
          <p className="font-bold text-gray-800 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              <span className="font-semibold">{entry.name}:</span> {entry.value.toFixed(2)} MWh
            </p>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className={`text-sm font-bold ${
              payload[0].payload.performance >= 100 ? 'text-green-600' : 
              payload[0].payload.performance >= 80 ? 'text-yellow-600' : 
              'text-red-600'
            }`}>
              Performance: {payload[0].payload.performance.toFixed(1)}%
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const calculateStats = () => {
      if (!selectedPlant || data.length === 0) return null;

      // 1. Existing Stats
      const plantDays = data.filter(d => d.plants[selectedPlant]); // Get only days with data for this plant
      const actualValues = plantDays.map(d => d.plants[selectedPlant]?.actual || 0);
      const expectedValues = plantDays.map(d => d.plants[selectedPlant]?.expected || 0);
      const performanceValues = plantDays.map(d => d.plants[selectedPlant]?.performance || 0);

      // 2. Calculate Total Period in Hours
      // Assuming data is sorted by date. If not, we might need to find min/max date.
      // Logic: (Number of entries for this plant) * 24 hours
      const totalPeriodHours = plantDays.length * 24;

      // 3. Calculate Downtime
      let generalDowntimeHours = 0;
      let technicalDowntimeHours = 0;

      selectedPlantProblems.forEach(prob => {
          const hours = parseDurationToHours(prob.duration);
          
          // Sum for General
          generalDowntimeHours += hours;

          // Sum for Technical (Exclude 'Distribuidora')
          // We trim and lowercase to be safe
          const resolution = prob.resolution ? prob.resolution.toString().trim().toLowerCase() : '';
          if (resolution !== 'distribuidora') {
              technicalDowntimeHours += hours;
          }
      });

      // 4. Calculate Availabilities
      // Prevent division by zero if no data
      const generalAvail = totalPeriodHours > 0 
          ? ((totalPeriodHours - generalDowntimeHours) / totalPeriodHours) * 100 
          : 0;

      const technicalAvail = totalPeriodHours > 0 
          ? ((totalPeriodHours - technicalDowntimeHours) / totalPeriodHours) * 100 
          : 0;

      return {
        totalActual: actualValues.reduce((sum, val) => sum + val, 0),
        totalExpected: expectedValues.reduce((sum, val) => sum + val, 0),
        avgPerformance: performanceValues.reduce((sum, val) => sum + val, 0) / performanceValues.length,
        maxActual: Math.max(...actualValues),
        minActual: Math.min(...actualValues),
        avgActual: actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length,
        // NEW STATS
        generalAvailability: generalAvail,
        technicalAvailability: technicalAvail
      };
    };

  const stats = calculateStats();

  const handleDownloadPDF = async () => {
    const element = printRef.current;
    if (!element) return;

    try {
      const loadScript = (src: string) => {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve(true);
            return;
          }
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      };

      if (!(window as any).html2canvas) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }
      if (!(window as any).jspdf) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }

      const html2canvas = (window as any).html2canvas;
      const { jsPDF } = (window as any).jspdf;

      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
        windowHeight: element.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pdfWidth = 210;
      const pageHeight = 297;
      const margin = 5;
      const contentWidth = pdfWidth - (margin * 2);
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save('plant-performance-report.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  const getPerformanceColor = (performance: number) => {
      if (performance >= 120) return '#6366f1'; // Indigo-500 (Excellent/Blue-ish)
      if (performance >= 100) return '#34d399'; // Emerald-400 (Good/Green)
      if (performance >= 80) return '#fbbf24';  // Amber-400 (Warning/Yellow)
      if (performance >= 60) return '#fb923c';  // Orange-400 (Low/Orange)
      return '#f87171';                         // Red-400 (Bad/Red - but softer)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="text-xl font-semibold text-gray-600 animate-pulse">
          Carregando dados...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="text-xl font-semibold text-red-600">
          Erro ao carregar dados do Excel
        </div>
      </div>
    );
  }


  console.log("Current Selected Plant:", selectedPlant);
  console.log("Available Plant Names in Problems:", [...new Set(problems.map(p => p.name))]);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto" ref={printRef}>
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Performance das Usinas</h1>
              <p className="text-gray-600 mt-2">Análise de Geração Atual vs. Esperada (P50)</p>
              <p className="text-sm text-gray-500 mt-1">Janeiro 2026</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg">
                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"/>
                </svg>
              </div>
              <button 
                onClick={handleDownloadPDF}
                data-html2canvas-ignore
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center transition-colors shadow-md"
              >
                <svg className="fill-current w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M13 8V2H7v6H2l8 8 8-8h-5zM0 18h20v2H0v-2z"/>
                </svg>
                <span>Baixar PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Plant Selector Dropdown */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6" data-html2canvas-ignore>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Selecionar Usina</h2>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full md:w-96 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center justify-between"
            >
              <span className="truncate">{selectedPlant || 'Selecione uma usina'}</span>
              <svg 
                className={`w-5 h-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-10 w-full md:w-96 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 max-h-80 overflow-y-auto">
                {availablePlants.map((plant) => (
                  <button
                    key={plant}
                    onClick={() => {
                      setSelectedPlant(plant);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                      selectedPlant === plant ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {plant}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* View Type Toggle */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6" data-html2canvas-ignore>
          <div className="flex items-center gap-4">
            <span className="text-gray-700 font-medium">Visualização:</span>
            <button
              onClick={() => setViewType('actual')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewType === 'actual' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Atual
            </button>
            <button
              onClick={() => setViewType('expected')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewType === 'expected' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Esperado (P50)
            </button>
            <button
              onClick={() => setViewType('both')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewType === 'both' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Comparação
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        {stats && (
          // CHANGED: lg:grid-cols-4 -> lg:grid-cols-3 (To make a perfect 3x2 grid for 6 cards)
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            
            {/* 1. Geração Total */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Geração Total (Atual)</h3>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 7H7v6h6V7z"/>
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats.totalActual.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MWh</p>
            </div>

            {/* 2. Esperado P50 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Esperado (P50)</h3>
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z"/>
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-purple-600">{stats.totalExpected.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MWh</p>
            </div>

            {/* 3. Média Diária */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Média Diária</h3>
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"/>
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-bold text-orange-600">{stats.avgActual.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">MWh/dia</p>
            </div>

            {/* 4. Performance Média */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Performance Média</h3>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stats.avgPerformance >= 100 ? 'bg-green-100' : 
                  stats.avgPerformance >= 80 ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                  <svg className={`w-6 h-6 ${
                    stats.avgPerformance >= 100 ? 'text-green-600' : 
                    stats.avgPerformance >= 80 ? 'text-yellow-600' : 'text-red-600'
                  }`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                </div>
              </div>
              <p className={`text-2xl font-bold ${
                stats.avgPerformance >= 100 ? 'text-green-600' : 
                stats.avgPerformance >= 80 ? 'text-yellow-600' : 'text-red-600'
              }`}>{stats.avgPerformance.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-1">do P50</p>
            </div>

            {/* 5. NEW: Disponibilidade Geral */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Disponibilidade Geral</h3>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stats.generalAvailability >= 98 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <svg className={`w-6 h-6 ${
                    stats.generalAvailability >= 98 ? 'text-green-600' : 'text-red-600'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className={`text-2xl font-bold ${
                stats.generalAvailability >= 98 ? 'text-green-600' : 'text-red-600'
              }`}>
                {stats.generalAvailability.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Tempo total operativo</p>
            </div>

            {/* 6. NEW: Disponibilidade Técnica */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Disponibilidade Técnica</h3>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  stats.technicalAvailability >= 99 ? 'bg-blue-100' : 'bg-yellow-100'
                }`}>
                  <svg className={`w-6 h-6 ${
                    stats.technicalAvailability >= 99 ? 'text-blue-600' : 'text-yellow-600'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
              <p className={`text-2xl font-bold ${
                stats.technicalAvailability >= 99 ? 'text-blue-600' : 'text-yellow-600'
              }`}>
                {stats.technicalAvailability.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Excluindo rede/distribuidora</p>
            </div>
            
          </div>
        )}
        
{/* --- UPDATED TIMELINE CHART --- */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">
            Timeline de Geração - {selectedPlant}
          </h2>
          <ResponsiveContainer width="100%" height={450}>
            <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Geração (MWh)', angle: -90, position: 'insideLeft', fill: '#64748b' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" />
              
              {(viewType === 'expected' || viewType === 'both') && (
                <Line
                  type="monotone"
                  dataKey="expected"
                  stroke="#a855f7" // Purple-500
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                  name="Esperado (P50)"
                />
              )}
              
              {(viewType === 'actual' || viewType === 'both') && (
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#6366f1" // Indigo-500
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorActual)"
                  name="Atual"
                  // HERE IS THE MAGIC: We pass our custom dot component
                  dot={<ProblemDot />} 
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* --- UPDATED PERFORMANCE BAR CHART --- */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Performance Diária (%)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis 
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Performance (%)', angle: -90, position: 'insideLeft', fill: '#64748b' }}
              />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Performance']}
              />
              <Bar 
                dataKey="performance" 
                radius={[4, 4, 0, 0]}
                name="Performance"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getPerformanceColor(entry.performance)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
    
      {/* NEW SECTION: Problems Table */}
      <div className="bg-white rounded-xl shadow-lg p-6 mt-6 mb-10">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Ocorrências e Problemas - {selectedPlant}
        </h2>

        {selectedPlantProblems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-sm font-semibold text-slate-600 whitespace-nowrap">Início</th>
                  <th className="p-4 text-sm font-semibold text-slate-600 whitespace-nowrap">Duração</th> {/* Added Duration */}
                  <th className="p-4 text-sm font-semibold text-slate-600 w-1/3">Equipamentos</th> {/* Restricted Width */}
                  <th className="p-4 text-sm font-semibold text-slate-600">Causa</th>
                  <th className="p-4 text-sm font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedPlantProblems.map((prob) => {
                  // LOGIC: Show max 3 tags, hide the rest behind a badge
                  const maxTags = 3;
                  const visibleTags = prob.equipamentos.slice(0, maxTags);
                  const hiddenCount = prob.equipamentos.length - maxTags;
                  
                  return (
                    <tr key={prob.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      {/* Date Column */}
                      <td className="p-4 text-sm text-slate-700 whitespace-nowrap">
                        {prob.when instanceof Date 
                          ? prob.when.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) 
                          : String(prob.when)}
                      </td>

                      {/* Duration Column (New) */}
                      <td className="p-4 text-sm text-slate-700 font-mono">
                        {typeof prob.duration === 'number' 
                          ? `${(prob.duration * 24).toFixed(2)}h` // If it's an Excel number
                          : prob.duration // If it's a string "HH:mm:ss"
                        }
                      </td>

                      {/* Equipments Column (Optimized) */}
                      <td className="p-4 text-sm">
                        <div className="flex flex-wrap gap-1" title={prob.equipamentos.join(', ')}>
                          {visibleTags.map((tag, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs whitespace-nowrap">
                              {tag}
                            </span>
                          ))}
                          {hiddenCount > 0 && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 border border-gray-200 rounded text-xs font-semibold whitespace-nowrap cursor-help">
                              +{hiddenCount} outros
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cause & Observation */}
                      <td className="p-4 text-sm text-slate-700">
                        <span className="font-medium block">{prob.cause}</span>
                        {prob.observation && (
                          <span className="text-xs text-slate-500 line-clamp-2" title={prob.observation}>
                            {prob.observation}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                          prob.status === 'Concluido' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {prob.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            Nenhuma ocorrência registrada para esta usina no período.
          </div>
        )}
      </div>
    </div>
  </div>
  )
};

export default PlantPerformanceVisualization;