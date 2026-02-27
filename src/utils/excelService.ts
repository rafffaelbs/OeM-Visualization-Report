import * as XLSX from 'xlsx';

export const fetchExcelData = async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was no ok");

        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const data = XLSX.utils.sheet_to_json(worksheet);
        return data;
    } catch (error) {
        console.error("Error fetching Excel: ", error);
        return [];
    }
};