// utils/dataCleaner.ts
import type { DayData, PlantProblems } from '../types';
import * as XLSX from 'xlsx';

export const getAvailablePlants = (transformedData: DayData[]): string[] => {
  if (transformedData.length === 0) return [];
  return Object.keys(transformedData[0].plants);
};


export const transformDashboardData = (workbookGeracao: XLSX.WorkBook): DayData[] => {
  const sheetName = '2026 P50';
  const worksheet = workbookGeracao.Sheets[sheetName];
  if (!worksheet) return [];

  const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 4, defval: 0 }).slice(0, 33);
  if (rawData.length < 3) return [];

  const expectedRow: any = rawData[1]; 
  const actualDataRows = rawData.slice(2); 

  return actualDataRows.map((row: any) => {
    let dayNumber = 1;
    const rawDia = row['DIA'];

    // Excel Date parsing logic
    if (typeof rawDia === 'number') {
        dayNumber = rawDia > 31 ? XLSX.SSF.parse_date_code(rawDia).d : rawDia;
    } else {
        dayNumber = parseInt(String(rawDia)) || 1;
    }

    const dayLabel = `2026-01-${dayNumber.toString().padStart(2, '0')}`;
    const plantMetrics: any = {};

    Object.keys(row).forEach((key) => {
      if (key !== 'DIA' && key !== '__rowNum__') {
        const actual = typeof row[key] === 'number' ? row[key] : parseFloat(row[key]) || 0;
        const expected = expectedRow[key] ? (typeof expectedRow[key] === 'number' ? expectedRow[key] : parseFloat(expectedRow[key]) || 0) : 0;
        const performance = expected === 0 ? 0 : (actual / expected) * 100;

        plantMetrics[key] = {
          name: key,
          actual: actual,
          expected: expected,
          performance: Number(performance.toFixed(2)),
        };
      }
    });

    return { DIA: dayLabel, plants: plantMetrics };
  });
};


export const transformProblemLogs = (workbookOcorrencia: XLSX.WorkBook): PlantProblems[] => {
  // Use exact sheet name (with that leading space)
  const sheetName = ' Janeiro 2026'; 
  const worksheet = workbookOcorrencia.Sheets[sheetName];
  if (!worksheet) {
    console.error("Sheet not found:", sheetName);
    return [];
  }

  // Use 'header: 1' first to find where the actual headers are, 
  // or just use standard conversion if the headers are on the first row.
  const rawLogs: any[] = XLSX.utils.sheet_to_json(worksheet);
  const groupedProblems = new Map<string, PlantProblems>();

  rawLogs.forEach((row, index) => {
    // 1. DATA CLEANING: Excel often adds empty rows or rows with only spaces.
    // We check if 'UFV' exists in this row.
    const ufvName = row['UFV'] ? String(row['UFV']).trim() : null;
    if (!ufvName) return; // Skip rows that don't have a plant name

    const startTime = row['Início Real do Evento'] || row['Início'];
    const groupKey = `${ufvName}_${startTime}`; 

    const hasEnd = row['Fim'] && String(row['Fim']).trim() !== '';
    const tag = row['Tag'] ? String(row['Tag']).trim() : '';

    if (groupedProblems.has(groupKey)) {
      const existing = groupedProblems.get(groupKey)!;
      if (tag && !existing.equipamentos.includes(tag)) {
        existing.equipamentos.push(tag);
      }
    } else {
      let dateValue = startTime;
      if (typeof startTime === 'number') {
        const d = XLSX.SSF.parse_date_code(startTime);
        dateValue = new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
      } else if (typeof startTime === 'string') {
        dateValue = startTime;
      }
      
        
      groupedProblems.set(groupKey, {
        id: index,
        name: ufvName,
        cause: row['Causa'] || 'Não informada',
        observation: row['Observação'] || '',
        when: dateValue, 
        end: row['Fim'] || null,
        duration: row['Duração'] instanceof Date ? row['Duração'].toLocaleTimeString() : (row['Duração'] || '00:00:00'),
        equipamentos: tag ? [tag] : [],
        resolution: row['Resolução'] || '',
        status: hasEnd ? 'Concluido' : 'Aberto'
      });
    }
  });

  return Array.from(groupedProblems.values());
};


export const parseDurationToHours = (duration: string | number): number => {
  if (!duration) return 0;

  // Case 1: Number (Excel fraction of a day, e.g., 0.041666 = 1 hour)
  if (typeof duration === 'number') {
    return duration * 24;
  }

  // Case 2: String "HH:mm:ss"
  if (typeof duration === 'string') {
    // If it's a string number "0.5"
    if (!isNaN(Number(duration)) && duration.includes('.')) {
         return Number(duration) * 24;
    }
    
    const parts = duration.split(':');
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseInt(parts[2], 10);
      return h + m / 60 + s / 3600;
    }
  }

  return 0;
};
