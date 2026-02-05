export interface PlantMetrics {
  name: string;
  actual: number;
  expected: number;
  performance: number;
  problems: PlantProblems[]; 
}
export interface DayData {
  DIA: string;
  plants: {
    [plantName: string]: PlantMetrics;
  };
}

export interface PlantProblems {
  id: number;
  name: string;          // Mapped from 'UFV'
  cause: string;         // Mapped from 'Causa'
  observation: string;   // Mapped from 'Observação'
  when: Date | string;   // Mapped from 'Início Real do Evento'
  end: Date | string;    // Mapped from 'Fim'
  duration: string;      // Mapped from 'Duração'
  equipamentos: string[];// Mapped from 'Tag' (can be an array if split by commas/spaces)
  status: 'Aberto' | 'Concluido';
  resolution: string;    // Mapped from 'Resolução'
}