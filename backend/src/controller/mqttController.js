const mqttModel = require('../models/mqttModel');

const { sendRealTimeData } = require('../config/socket'); // Import WebSocket function

// Temporary storage for latest MQTT data
let latestMqttData = {};

// Function to process incoming MQTT messages
function processMqttMessage(topic, message) {
    const data = message.split(',').map(value => (value.trim() === '' ? null : value.trim()));
    // const deviceId = data[0];
    const deviceId = data[0]?.toLowerCase(); // Normalize to lowercase

    if (!deviceId) {
        console.log('Received data without a device ID. Ignoring...');
        return;
    }

    if (!latestMqttData[deviceId]) {
        latestMqttData[deviceId] = {};
    }

    // latestMqttData[deviceId] = {
    //     subtopic: topic,
    //     deviceId,
    // };

    latestMqttData[deviceId].subtopic = topic;
    latestMqttData[deviceId].deviceId = deviceId;

    // Update latest data while preserving previous values if new ones are missing
    const fields = [
        'runningHours', 'signalStrength', 'NO2', 'O2', 'CO', 'PM1', 'PM2_5', 'PM10', 'temperature', 'humidity',
        'VOC', 'CO2', 'O3', 'CH2O', 'AQI'
    ];

    fields.forEach((key, index) => {
        // const value = data[index + 1] ? parseFloat(data[index + 1]) : latestMqttData[deviceId][key] || 0;
        // latestMqttData[deviceId][key] = value;

        // let value = data[index + 1] ? parseFloat(data[index + 1]) : 0;

        // // Preserve last nonzero value
        // if (value === 0 && latestMqttData[deviceId][key] !== undefined && latestMqttData[deviceId][key] !== 0) {
        //     value = latestMqttData[deviceId][key]; // Use the last nonzero value from memory
        // }

        // latestMqttData[deviceId][key] = value;

        let value = data[index + 1] ? parseFloat(data[index + 1]) : 0;

        // If value is 0, retain the last known nonzero value
        if (value === 0) {
            value = latestMqttData[deviceId][key] !== undefined && latestMqttData[deviceId][key] !== 0
                ? latestMqttData[deviceId][key]  // Use previous nonzero value
                : 0; // Default to 0 if no prior value exists
        }

        latestMqttData[deviceId][key] = value;
    });

    console.log(`Emitting real-time data for device ${deviceId}: `, latestMqttData[deviceId]);
    sendRealTimeData(deviceId, latestMqttData[deviceId]); // Send real-time updates via WebSocket
}

// Function to fetch last **nonzero** value from MongoDB for a field
async function getLastNonZeroValue(deviceId, field) {
    try {
        const record = await mqttModel.findOne({
            // deviceId,
            deviceId: { $regex: new RegExp(`^${deviceId}$`, 'i') }, // Case-insensitive match
            [field]: { $ne: 0, $exists: true }, // Look for non-zero values
        })
        .sort({ createdAt: -1 }) // Get most recent value
        .exec();

        return record ? record[field] : null;
    } catch (err) {
        console.error('Error querying for non-zero value:', err);
        return null;
    }
}

// Function to save the latest data at regular intervals
async function saveLatestData() {
    if (Object.keys(latestMqttData).length === 0) {
        console.log('No device data to save at this interval.');
        return;
    }

    console.log('Processing data for saving...');

    for (const deviceId of Object.keys(latestMqttData)) {
        let deviceData = latestMqttData[deviceId];

        // Replace missing or zero values with the last non-zero value from DB
        await Promise.all(
            Object.keys(deviceData).map(async key => {
                // if (deviceData[key] === 0 || deviceData[key] === null) {
                if (deviceData[key] === 0 || deviceData[key] === null) {
                    const lastValue = await getLastNonZeroValue(deviceId, key);
                    if (lastValue !== null) {
                        deviceData[key] = lastValue;
                    }
                }
                
                if (key === "temperature" && deviceData[key] !== null) {
                    // const tempStr = deviceData[key].toString();

                    const tempValue = parseInt(deviceData[key], 10);
                    if (!isNaN(tempValue)) {
                        if (tempValue >= 10000) {
                            deviceData[key] = (tempValue / 100).toFixed(2);
                        } else if (tempValue >= 1000) {
                            deviceData[key] = (tempValue / 100).toFixed(2);
                        } else if (tempValue >= 100) {
                            deviceData[key] = (tempValue / 10).toFixed(1);
                        }
                    }
                }
            })
        );

        try {
            const mqttData = new mqttModel(deviceData);
            await mqttData.save();
            console.log(`Data saved for device ${deviceId}:`, mqttData);
        } catch (err) {
            console.error('Error saving data to MongoDB:', err);
        }
    }

    // Clear only saved data, keeping other incoming values intact
    latestMqttData = {};
}

function scheduleHourlySave() {
    const now = new Date();
    const nextHour = new Date(now);

    nextHour.setMinutes(0, 0, 0); // Reset minutes and seconds to 0
    nextHour.setHours(now.getHours() + 1); // Move to next hour

    const delay = nextHour - now; // Time left until the next full hour

    console.log(`Next data save scheduled at: ${nextHour.toLocaleString()}`);

    setTimeout(() => {
        saveLatestData(); // Call the save function
        setInterval(saveLatestData, 60 * 60 * 1000); // Run every hour after the first execution
    }, delay);
}

scheduleHourlySave(); // Start the schedule


module.exports = { processMqttMessage, latestMqttData };