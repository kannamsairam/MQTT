// utils/mqttUtils.js
const mqttModel = require("../models/mqttModel");

const lastNonZeroCache = {}; // In-memory cache for last nonzero values

// Function to fetch the last nonzero value from MongoDB
async function getLastNonZeroValue(deviceId, field) {
    try {
        const record = await mqttModel.findOne({
            deviceId,
            [field]: { $ne: 0, $exists: true },
        })
        .sort({ createdAt: -1 })
        .exec();
        return record ? record[field] : null;
    } catch (error) {
        console.error(`Error fetching last non-zero value for ${field}:`, error);
        return null;
    }
}

// Function to update data with last nonzero values
async function updateWithLastNonZeroValues(deviceId, data) {
    if (!lastNonZeroCache[deviceId]) {
        lastNonZeroCache[deviceId] = {};
    }

    await Promise.all(
        Object.keys(data).map(async (key) => {
            if (data[key] === 0 || data[key] === null) {
                if (lastNonZeroCache[deviceId][key] !== undefined) {
                    data[key] = lastNonZeroCache[deviceId][key]; // Use cached value
                } else {
                    const lastValue = await getLastNonZeroValue(deviceId, key);
                    if (lastValue !== null) {
                        data[key] = lastValue;
                        lastNonZeroCache[deviceId][key] = lastValue; // Store in cache
                    }
                }
            } else {
                lastNonZeroCache[deviceId][key] = data[key]; // Update cache with latest non-zero value
            }

            // Temperature conversion
            if (key === "temperature") {
                const tempStr = data[key].toString();
                if (tempStr.length === 5) {
                    data[key] = (data[key] / 1000).toFixed(2);
                } else if (tempStr.length === 4) {
                    data[key] = (data[key] / 100).toFixed(2);
                } else if (tempStr.length === 3) {
                    data[key] = (data[key] / 10).toFixed(1);
                }
            }
        })
    );
    return data;
}

module.exports = { getLastNonZeroValue, updateWithLastNonZeroValues };