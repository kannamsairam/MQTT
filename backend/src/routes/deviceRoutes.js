const deviceController = require('../controller/deviceController');
const express = require('express');

const deviceRouter = express.Router();

deviceRouter.post('/device-Register', deviceController.createDevice);
deviceRouter.post('/recover-user', deviceController.recovery);

deviceRouter.get('/ByID/:deviceID', deviceController.getDeviceByID);
deviceRouter.get('/:userUUID', deviceController.getAllDevices);

deviceRouter.delete('/delete/:deviceID', deviceController.deleteDevice);

const socketController = require('../config/socket');

deviceRouter.get('/graph/:deviceID', async function getLast24HoursDataAPI(req, res) {
    try {
        const { deviceID } = req.params;
        const data = await socketController.getLast24HoursDataAPI(deviceID);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = deviceRouter;