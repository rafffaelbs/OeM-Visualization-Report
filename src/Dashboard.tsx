import React, { useState, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

interface PlantData {
  name: string;
  [key: string]: number | string;
}

const MultiPlantDashboard = () => {
  const [data, setData] = useState<PlantData[]>([]);
  const [selectedPlants, setSelectedPlants] = useState<string[]>([]);
  const [availablePlants, setAvailablePlants] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'line' | 'bar'>('line');
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as PlantData[];
        
        // Process and clean the data
        const cleanedData = cleanData(jsonData);
        
        setData(cleanedData);
        extractPlantNames(cleanedData);
      } catch (error) {
        console.error("Error reading file:", error);
        alert("Erro ao ler o arquivo Excel. Verifique o formato.");
      }
    };

    reader.readAsBinaryString(file);
  };

  const cleanData = (rawData: any[]): PlantData[] => {
    // Data cleaning logic - customize based on your needs
    return rawData.map(row => {
      const cleanedRow: PlantData = { name: '' };
      
      Object.keys(row).forEach(key => {
        if (key.toLowerCase().includes('date') || key.toLowerCase().includes('data') || key === 'name') {
          // Handle date column
          cleanedRow.name = formatDate(row[key]);
        } else {
          // Handle numeric values - remove nulls, convert to numbers
          const value = row[key];
          if (value !== null && value !== undefined && value !== '') {
            cleanedRow[key] = typeof value === 'number' ? value : parseFloat(value) || 0;
          }
        }
      });
      
      return cleanedRow;
    }).filter(row => row.name); // Remove rows without dates
  };

  const formatDate = (dateValue: any): string => {
    // Try to parse various date formats
    if (typeof dateValue === 'number') {
      // Excel serial date
      const date = XLSX.SSF.parse_date_code(dateValue);
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    if (typeof dateValue === 'string') {
      return dateValue;
    }
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue);
  };

  const extractPlantNames = (data: PlantData[]) => {
    if (data.length > 0) {
      const plants = Object.keys(data[0]).filter(key => key !== 'name');
      setAvailablePlants(plants);
      setSelectedPlants([plants[0]]); // Select first plant by default
    }
  };

  const togglePlant = (plant: string) => {
    setSelectedPlants(prev => 
      prev.includes(plant) 
        ? prev.filter(p => p !== plant)
        : [...prev, plant]
    );
  };

  const selectAllPlants = () => {
    setSelectedPlants(availablePlants);
  };

  const clearAllPlants = () => {
    setSelectedPlants([]);
  };

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  const calculateStats = () => {
    const stats: any = {};
    selectedPlants.forEach(plant => {
      const values = data.map(d => Number(d[plant]) || 0);
      const total = values.reduce((sum, val) => sum + val, 0);
      const avg = total / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      stats[plant] = { total, avg, max, min };
    });
    return stats;
  };

  const stats = data.length > 0 ? calculateStats() : {};

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

      pdf.save('multi-plant-report.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Erro ao gerar PDF.");
    }
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto" ref={printRef}>
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Dashboard Multi-Usinas</h1>
              <p className="text-gray-600 mt-2">Comparativo de Geração por Usina</p>
              {data.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  Período: {data[0]?.name} a {data[data.length - 1]?.name}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500 rounded-full">
                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 7H7v6h6V7z"/>
                  <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z"/>
                </svg>
              </div>
              {data.length > 0 && (
                <button 
                  onClick={handleDownloadPDF}
                  data-html2canvas-ignore
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors shadow-md"
                >
                  <svg className="fill-current w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M13 8V2H7v6H2l8 8 8-8h-5zM0 18h20v2H0v-2z"/>
                  </svg>
                  <span>Baixar PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Carregar Arquivo Excel</h2>
          <div className="flex items-center gap-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg inline-flex items-center transition-colors shadow-md"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
              </svg>
              Upload Excel (.xlsx, .xls)
            </button>
            {fileName && (
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                <span className="font-medium">{fileName}</span>
              </div>
            )}
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Formato esperado:</strong> A primeira coluna deve conter as datas, e as demais colunas devem conter os nomes das usinas com seus respectivos valores de geração.
            </p>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <svg className="w-24 h-24 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Nenhum dado carregado</h3>
            <p className="text-gray-500">Faça upload de um arquivo Excel para começar</p>
          </div>
        ) : (
          <>
            {/* Plant Selector */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6" data-html2canvas-ignore>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">Selecionar Usinas</h2>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllPlants}
                    className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                  >
                    Selecionar Todas
                  </button>
                  <button
                    onClick={clearAllPlants}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {availablePlants.map((plant, idx) => (
                  <button
                    key={plant}
                    onClick={() => togglePlant(plant)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      selectedPlants.includes(plant)
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: selectedPlants.includes(plant) ? 'white' : colors[idx % colors.length] }}
                      ></div>
                      {plant}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6" data-html2canvas-ignore>
              <div className="flex items-center gap-4">
                <span className="text-gray-700 font-medium">Tipo de Visualização:</span>
                <button
                  onClick={() => setViewMode('line')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    viewMode === 'line' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Linha
                </button>
                <button
                  onClick={() => setViewMode('bar')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    viewMode === 'bar' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Barras
                </button>
              </div>
            </div>

            {/* Statistics Cards */}
            {selectedPlants.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {selectedPlants.map((plant) => (
                  <div key={plant} className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: colors[availablePlants.indexOf(plant) % colors.length] }}
                      ></div>
                      <h3 className="text-lg font-bold text-gray-800">{plant}</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total:</span>
                        <span className="text-sm font-semibold text-gray-800">{stats[plant].total.toFixed(2)} MWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Média:</span>
                        <span className="text-sm font-semibold text-gray-800">{stats[plant].avg.toFixed(2)} MWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Máximo:</span>
                        <span className="text-sm font-semibold text-green-600">{stats[plant].max.toFixed(2)} MWh</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Mínimo:</span>
                        <span className="text-sm font-semibold text-orange-600">{stats[plant].min.toFixed(2)} MWh</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Main Chart */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Geração por Usina</h2>
              {selectedPlants.length === 0 ? (
                <div className="h-96 flex items-center justify-center text-gray-500">
                  Selecione ao menos uma usina para visualizar os dados
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  {viewMode === 'line' ? (
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        label={{ value: 'Geração (MWh)', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        formatter={(value) => `${Number(value).toFixed(2)} MWh`}
                      />
                      <Legend />
                      {selectedPlants.map((plant) => (
                        <Line
                          key={plant}
                          type="monotone"
                          dataKey={plant}
                          stroke={colors[availablePlants.indexOf(plant) % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        tick={{ fill: '#6b7280', fontSize: 12 }}
                        label={{ value: 'Geração (MWh)', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                        formatter={(value) => `${Number(value).toFixed(2)} MWh`}
                      />
                      <Legend />
                      {selectedPlants.map((plant) => (
                        <Bar
                          key={plant}
                          dataKey={plant}
                          fill={colors[availablePlants.indexOf(plant) % colors.length]}
                          radius={[8, 8, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            {/* Data Table */}
            {selectedPlants.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Dados Detalhados</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 text-gray-700 font-semibold">Data</th>
                        {selectedPlants.map(plant => (
                          <th key={plant} className="text-right py-3 px-4 text-gray-700 font-semibold">
                            {plant}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-800">{row.name}</td>
                          {selectedPlants.map(plant => (
                            <td key={plant} className="py-3 px-4 text-right font-semibold text-gray-800">
                              {Number(row[plant]).toFixed(2)} MWh
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MultiPlantDashboard;