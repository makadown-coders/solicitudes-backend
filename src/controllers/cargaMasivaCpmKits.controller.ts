import { Request, Response } from 'express';
import { FinalizeReq } from '../models/cargaMasivaCpmKits/FinalizeReq';
import { BatchReq } from '../models/cargaMasivaCpmKits/BatchReq';
import CargaMasivaCpmKitsService from '../services/cargaMasivaCpmKits.service';

export default class CargaMasivaCpmKitsController {
  private srv = new CargaMasivaCpmKitsService();

  init = async (req: Request, res: Response) => {
    const out = await this.srv.init(req.body);
    res.json(out);
  };

  batchUpsert = async (req: Request, res: Response) => {
    const out = await this.srv.batchUpsert(req.body);
    res.json(out);
  };
}