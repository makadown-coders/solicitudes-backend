import { BatchRowDTO } from "./BatchRowDTO";


export type BatchReq = {
    importId: string;
    rows: BatchRowDTO[];
};
