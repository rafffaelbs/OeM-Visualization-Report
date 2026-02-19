// utils/dataCleaner.ts
import type { DayData, PlantDailyMetrics, PlantMetadata, PlantProblems } from '../types';
import * as XLSX from 'xlsx';


export const getAvailablePlants = (transformedData: DayData[]): string[] => {
  if (transformedData.length === 0) return [];
  return Object.keys(transformedData[0].plants);
};

export const parseDurationToHours = (duration: string | number): number => {
  if (!duration) return 0;

  // Case 1: Number (Excel fraction of a day, e.g., 0.041666 = 1 hour)
  if (typeof duration === 'number') {
    return duration * 24;
  }

  // Case 2: String "HH:mm:ss" or "0.5"
  if (typeof duration === 'string') {
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

// Reads the static plant data (State, Complex, Name)
export const transformPlantRegistry = (
  metadataWorkbook: XLSX.WorkBook,
  capacityWorkbook: XLSX.WorkBook // Added second workbook parameter
): PlantMetadata[] => {
  
  // 1. Process Base Metadata
  const sheetName = 'Dados Inversores';
  const worksheet = metadataWorkbook.Sheets[sheetName];
  let uniqueRegistry: PlantMetadata[] = [];
  
  if (!worksheet) {
    console.warn(`Sheet "${sheetName}" not found in registry file.`);
  } else {
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);
    const registry: PlantMetadata[] = rawData
      .filter((row: any) => row['Nome Monitoramento Brasol'] && row['Estado'])
      .map((row: any) => ({
        id: String(row['Nome Monitoramento Brasol']).trim(),
        name: String(row['Nome Monitoramento Brasol']).trim(),
        uf: String(row['Estado']).trim(),
        complexo: String(row['Complexo']).trim(),
      }));

    // Deduplicate
    uniqueRegistry = Array.from(new Map(registry.map(item => [item.name, item])).values());
  }

  // 2. Process Capacities from the second workbook
  const capacityMap = new Map<string, number>();
  const capacitySheetName = 'TABELA RESUMO - P50';
  const capacitySheet = capacityWorkbook.Sheets[capacitySheetName];

  if (capacitySheet) {
    const capacityData: any[] = XLSX.utils.sheet_to_json(capacitySheet);
    
    capacityData.forEach((row: any) => {
      // Robust key matching to handle potential trailing spaces in Excel headers
      const usinaKey = Object.keys(row).find(k => k.trim().toUpperCase() === 'USINA');
      const pwrKey = Object.keys(row).find(k => k.trim().toUpperCase().includes('POTÊNCIA INSTALADA'));

      if (usinaKey && pwrKey && row[usinaKey] && row[pwrKey] !== undefined) {
        const plantName = String(row[usinaKey]).trim();
        let capacityVal = row[pwrKey];

        // Convert Brazilian number string format ("1.900,00") to float if necessary
        if (typeof capacityVal === 'string') {
          capacityVal = parseFloat(capacityVal.replace(/\./g, '').replace(',', '.'));
        } else {
          capacityVal = Number(capacityVal);
        }

        if (!isNaN(capacityVal)) {
          capacityMap.set(plantName, capacityVal);
        }
      }
    });
  } else {
    console.warn(`Sheet "${capacitySheetName}" not found in capacity workbook.`);
  }

  // 3. Merge capacity into the registry
  return uniqueRegistry.map(plant => ({
    ...plant,
    capacity: capacityMap.get(plant.name) || 0 // Maps the capacity, defaults to 0 if not found
  }));
};

// Reads the daily generation numbers (Actual vs P50)
export const transformDashboardData = (workbookGeracao: XLSX.WorkBook): DayData[] => {
  const sheetName = '2026 P50';
  const worksheet = workbookGeracao.Sheets[sheetName];
  if (!worksheet) return [];

  // Read data starting from Row 5 (headers)
  const rawData = XLSX.utils.sheet_to_json(worksheet, { range: 4, header: 1, defval: 0 }) as any[][];

  if (rawData.length < 5) return [];

  const headerRow = rawData[0];      // Row 5
  const expectedRow = rawData[2];    // Row 7 (P50)
  const actualDataRows = rawData.slice(3); // Row 8+ (Daily Data)

  const result: DayData[] = [];
  const PLANTS_PER_BLOCK = 69;
  const TOTAL_COL_PER_BLOCK = 70;

  // Loop through 12 months
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    
    // Calculate column offset
    const startCol = 1 + (monthIndex * TOTAL_COL_PER_BLOCK);
    const endCol = startCol + PLANTS_PER_BLOCK - 1; 

    // Stop if we run out of headers
    if (!headerRow[startCol]) break;

    const monthData = actualDataRows.map((row) => {
      const rawDia = row[0];
      let dayNumber = -1;

      // --- RESTORED LOGIC: Handle Excel Serial Dates ---
      if (typeof rawDia === 'number') {
        // If the number is huge (e.g. 43648), it's a serial date.
        // If it's small (e.g. 5), it's just the day.
        if (rawDia > 31) {
           const dateInfo = XLSX.SSF.parse_date_code(rawDia);
           dayNumber = dateInfo.d; // Extract just the day (1-31)
        } else {
           dayNumber = rawDia;
        }
      } else {
        // Handle text strings like "1" or "01"
        dayNumber = parseInt(String(rawDia).trim(), 10);
      }
      // -------------------------------------------------

      // Validation: Skip rows that are still invalid (like "Total" or empty rows)
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 31) return null;

      // Construct the date for the chart: 2026-MM-DD
      const currentMonth = (monthIndex + 1).toString().padStart(2, '0');
      const dayLabel = `2026-${currentMonth}-${dayNumber.toString().padStart(2, '0')}`;

      const plantMetrics: { [key: string]: PlantDailyMetrics } = {};
      let hasData = false;

      // Loop only through the columns for THIS month
      for (let c = startCol; c <= endCol; c++) {
        const plantName = headerRow[c]?.toString().trim();
        if (!plantName) continue;

        const actual = typeof row[c] === 'number' ? row[c] : parseFloat(row[c]) || 0;
        
        const expectedVal = expectedRow[c];
        const expected = typeof expectedVal === 'number' ? expectedVal : parseFloat(expectedVal) || 0;

        // Optimization: Skip empty data points
        if (actual === 0 && expected === 0) continue;

        const performance = expected === 0 ? 0 : (actual / expected) * 100;

        plantMetrics[plantName] = {
          actual,
          expected,
          performance: Number(performance.toFixed(2)),
          problems: []
        };
        hasData = true;
      }

      if (!hasData) return null;

      return { DIA: dayLabel, plants: plantMetrics };
    }).filter(Boolean) as DayData[];

    result.push(...monthData);
  }

  return result;
};

export const transformProblemLogs = (workbookOcorrencia: XLSX.WorkBook): PlantProblems[] => {
  const groupedProblems = new Map<string, any>();
  let globalIdCounter = 0; // Use a global counter for unique IDs across all sheets

  // 1. Define the valid months to look for
  const validMonths = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // 2. Loop through ALL sheet names in the workbook
  workbookOcorrencia.SheetNames.forEach((sheetName) => {
    
    // Normalize name to check pattern (e.g. " Janeiro 2026 " -> "Janeiro 2026")
    const cleanName = sheetName.trim();

    // 3. Pattern Match: Must contain "2026" and start with a valid month name
    const isTargetSheet = validMonths.some(month => 
      cleanName.toLowerCase().startsWith(month.toLowerCase()) && 
      cleanName.endsWith('2026')
    );

    if (!isTargetSheet) {
      // Skip sheets that aren't monthly logs (e.g., "Resumo", "Config", etc.)
      return;
    }

    console.log(`Processing Sheet: "${sheetName}"`);
    
    const worksheet = workbookOcorrencia.Sheets[sheetName];
    const rawLogs: any[] = XLSX.utils.sheet_to_json(worksheet);

    rawLogs.forEach((row) => {
      const ufvNameRaw = row['UFV'];
      if (!ufvNameRaw) return; 

      const ufvName = String(ufvNameRaw).trim();
      const startTime = row['Início Real do Evento'] || row['Início'];
      const groupKey = `${ufvName}_${startTime}`; 

      const hasEnd = row['Fim'] && String(row['Fim']).trim() !== '';
      const tag = row['Tag'] ? String(row['Tag']).trim() : '';

      // --- CRITICAL FIX: Handle Duration Data Type ---
      let rawDuration = row['Duração'];
      let cleanDuration: string | number = 0;

      if (typeof rawDuration === 'number') {
          cleanDuration = rawDuration;
      } else if (rawDuration instanceof Date) {
          cleanDuration = rawDuration.toLocaleTimeString('pt-BR', { hour12: false });
      } else if (typeof rawDuration === 'string') {
          cleanDuration = rawDuration;
      }
      // -----------------------------------------------

      if (groupedProblems.has(groupKey)) {
        const existing = groupedProblems.get(groupKey);
        if (tag && !existing.equipamentos.includes(tag)) {
          existing.equipamentos.push(tag);
        }
      } else {
        let dateValue: Date | string = startTime;
        
        if (typeof startTime === 'number') {
          const d = XLSX.SSF.parse_date_code(startTime);
          dateValue = new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
        }

        groupedProblems.set(groupKey, {
          id: globalIdCounter++, // Increment global ID
          name: ufvName,
          cause: row['Causa'] || 'Não informada',
          observation: row['Observação'] || '',
          when: dateValue,
          end: row['Fim'] || null,
          duration: cleanDuration, 
          equipamentos: tag ? [tag] : [],
          resolution: row['Resolução'] || '',
          status: hasEnd ? 'Concluido' : 'Aberto'
        });
      }
    });
  });

  return Array.from(groupedProblems.values());
};