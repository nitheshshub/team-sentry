"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPatientsRouter = createPatientsRouter;
const express_1 = require("express");
const mockPatients_1 = require("../data/mockPatients");
function createPatientsRouter() {
    const router = (0, express_1.Router)();
    router.get('/', (req, res) => {
        const { status, query } = req.query;
        let patients = [...mockPatients_1.mockPatients];
        if (status) {
            patients = patients.filter(p => p.status.toLowerCase() === status.toLowerCase());
        }
        if (query) {
            const q = query.toLowerCase();
            patients = patients.filter(p => p.name.toLowerCase().includes(q) || p.injury.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
        }
        const statusCounts = {
            Improving: mockPatients_1.mockPatients.filter(p => p.status === 'Improving').length,
            Stable: mockPatients_1.mockPatients.filter(p => p.status === 'Stable').length,
            'Needs Attention': mockPatients_1.mockPatients.filter(p => p.status === 'Needs Attention').length,
            'Recently Inactive': mockPatients_1.mockPatients.filter(p => p.status === 'Recently Inactive').length,
            'High Performing': mockPatients_1.mockPatients.filter(p => p.status === 'High Performing').length,
            Total: mockPatients_1.mockPatients.length
        };
        res.json({
            success: true,
            statusCounts,
            count: patients.length,
            patients
        });
    });
    router.get('/:id', (req, res) => {
        const patient = mockPatients_1.mockPatients.find(p => p.id.toLowerCase() === req.params.id.toLowerCase());
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
    router.get('/status/:statusCategory', (req, res) => {
        const statusCategory = req.params.statusCategory;
        const filtered = mockPatients_1.mockPatients.filter(p => p.status.toLowerCase().replace(/\s+/g, '') === statusCategory.toLowerCase().replace(/\s+/g, ''));
        res.json({
            success: true,
            category: statusCategory,
            count: filtered.length,
            patients: filtered
        });
    });
    return router;
}
