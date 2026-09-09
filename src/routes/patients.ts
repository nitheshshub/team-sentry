import { Router, Request, Response } from 'express';
import { mockPatients } from '../data/mockPatients';
import { PatientStatus } from '../types';

export function createPatientsRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const { status, query } = req.query;
    let patients = [...mockPatients];

    if (status) {
      patients = patients.filter(
        p => p.status.toLowerCase() === (status as string).toLowerCase()
      );
    }

    if (query) {
      const q = (query as string).toLowerCase();
      patients = patients.filter(
        p => p.name.toLowerCase().includes(q) || p.injury.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
    }

    const statusCounts = {
      Improving: mockPatients.filter(p => p.status === 'Improving').length,
      Stable: mockPatients.filter(p => p.status === 'Stable').length,
      'Needs Attention': mockPatients.filter(p => p.status === 'Needs Attention').length,
      'Recently Inactive': mockPatients.filter(p => p.status === 'Recently Inactive').length,
      'High Performing': mockPatients.filter(p => p.status === 'High Performing').length,
      Total: mockPatients.length
    };

    res.json({
      success: true,
      statusCounts,
      count: patients.length,
      patients
    });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const patient = mockPatients.find(p => p.id.toLowerCase() === req.params.id.toLowerCase());

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: `Patient with ID '${req.params.id}' not found`
      });
    }

    res.json({
      success: true,
      patient
    });
  });

  router.get('/status/:statusCategory', (req: Request, res: Response) => {
    const statusCategory = req.params.statusCategory;
    const filtered = mockPatients.filter(
      p => p.status.toLowerCase().replace(/\s+/g, '') === statusCategory.toLowerCase().replace(/\s+/g, '')
    );

    res.json({
      success: true,
      category: statusCategory,
      count: filtered.length,
      patients: filtered
    });
  });

  return router;
}
