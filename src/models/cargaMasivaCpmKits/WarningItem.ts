
export type WarningItem = {
    rowNumber: number;
    type: 'CLUES_NOT_FOUND' | 'CLAVE_NOT_FOUND' | 'BAD_CPM' | 'KIT_HEADER_UNKNOWN';
    message: string;
    clues?: string;
    clave_cnis?: string;
    kit?: string;
};
