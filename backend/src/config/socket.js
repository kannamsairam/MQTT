const { Server } = require("socket.io");
const mqttModel = require("../models/mqttModel");

let io;
const lastNonZeroCache = {}; //For in-memory cache for last nonzero values

function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods:["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);

        //Client subscribing to device ID
        socket.on("subscribeToDevice", async (deviceId) => {
            console.log(`Client subscribed to device: ${deviceId}`);
            socket.join(deviceId);

        });

        // // Handle request for last 24 hours data
        // socket.on("requestLast24HoursData", async (deviceId) => {
        //     console.log(`Fetching last 24 hours data for device: ${deviceId}`);
        //     const historicalData = await getLast24HoursData(deviceId);
        //     socket.emit("last24HoursData", historicalData);
        // });    
    });
}

async function sendRealTimeData(deviceID, data) {
    if(!io) {
        console.log(`[${new Date().toISOString()}] Websocket not initialized`);
        return;
    }

    if(!lastNonZeroCache[deviceID]){
        lastNonZeroCache[deviceID] = {};
    }

    const updatedData = { ...data };

    await Promise.all(
        Object.keys(updatedData).map(async (key) => {
            if(updatedData[key] === 0 || updatedData[key] === null){
            // if (updatedData[key] === null) {
                if(lastNonZeroCache[deviceID][key] !== undefined){
                    //using cached nonzero value
                    updatedData[key]= lastNonZeroCache[deviceID][key];
                } else {
                    // Fetch from DB if not in cache
                    const lastValue = await getLastNonZeroValue(deviceID, key);
                    if(lastValue!== null){
                        updatedData[key] = lastValue;
                        lastNonZeroCache[deviceID][key] = lastValue; // Store in cache
                    }
                 }
            } else {
                // Updating  cache with latest non-zero values
                lastNonZeroCache[deviceID][key] = updatedData[key];
            }

            // Ensure proper temperature formatting
            if (key === "temperature" && updatedData[key] !== null && Number.isInteger(updatedData[key])) {
                const tempStr = updatedData[key].toString();

                if (tempStr.length === 5) {
                    updatedData[key] = (parseFloat(updatedData[key]) / 1000).toFixed(3); // Example: 45123 → 45.123
                } else if (tempStr.length === 4) {
                    updatedData[key] = (parseFloat(updatedData[key]) / 100).toFixed(2); // Example: 3714 → 37.14
                } else if (tempStr.length === 3) {
                    updatedData[key] = (parseFloat(updatedData[key]) / 10).toFixed(1); // Example: 180 → 18.0
                }
            }
        })
    );
    console.log(`[${new Date().toISOString()}] Emitting real-time data for device ${deviceID}:`, updatedData);
    io.to(deviceID).emit("realTimeData", updatedData);
}

//Function for fetching last nonzero value from MongoDB
async function getLastNonZeroValue(deviceId, field) {
    try {
        const record = await mqttModel.findOne({
            deviceId: { $regex: new RegExp(deviceId, "i") },
            [field]: { $ne: 0 },
        })
            .sort({ createdAt: -1 })
            .exec();
            return record ? record[field] : null;
    } catch(error) {
        console.error(`[${new Date().toISOString()}] Error querying non-zero value:`, error);
        return null;
    }
}

function toIST(date) {
    return new Date(date.getTime() + 5.5 * 60 * 60 * 1000); // Convert UTC → IST
}

function getISTBucketTime(date) {
    const istDate = toIST(date);
    istDate.setMinutes(0, 0, 0); // Round to hour in IST
    return new Date(istDate.getTime() - 5.5 * 60 * 60 * 1000); // Convert back to UTC for consistent keys
}

async function getLast24HoursDataAPI(deviceId) {
    try {
        const nowUTC = new Date();
        const past24HoursUTC = new Date(nowUTC.getTime() - 24 * 60 * 60 * 1000);

        const records = await mqttModel.find({
            deviceId,
            createdAt: { $gte: past24HoursUTC, $lte: nowUTC }
        }).sort({ createdAt: 1 }).exec();

        // Step 1: Create 24 hourly IST buckets (keys stored in UTC form for safety)
        const hourlyData = {};
        for (let i = 0; i < 24; i++) {
            const istHour = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000 - i * 60 * 60 * 1000);
            istHour.setMinutes(0, 0, 0); // Round in IST
            const utcKey = new Date(istHour.getTime() - 5.5 * 60 * 60 * 1000).getTime();
            hourlyData[utcKey] = [];
        }

        // Step 2: Assign records into correct IST-rounded buckets
        records.forEach(record => {
            const istBucket = getISTBucketTime(new Date(record.createdAt)).getTime();
            if (!hourlyData[istBucket]) {
                hourlyData[istBucket] = [];
            }
            hourlyData[istBucket].push(record);
        });

        // Step 3: Prepare response with readable IST times
        const response = Object.keys(hourlyData)
            .sort((a, b) => b - a)
            .map(timestamp => ({
                timestamp: toIST(new Date(parseInt(timestamp))), // Show in IST
                data: hourlyData[timestamp] || []
            }));

        return response;

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching last 24 hours data:`, error);
        return [];
    }
}


// async function getLast24HoursDataAPI(deviceId) {
//     try {
//         const now = new Date();
//         const past24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

//         // Step 1: Fetch all data from the last 24 hours
//         const records = await mqttModel.find({
//             deviceId,
//             createdAt: { $gte: past24Hours, $lte: now }
//         }).sort({ createdAt: 1 }).exec();

//         // Step 2: Create 24 hourly time buckets
//         const hourlyData = {};
//         for (let i = 0; i < 24; i++) {
//             const bucketTime = new Date(now.getTime() - i * 60 * 60 * 1000);
//             bucketTime.setMinutes(0, 0, 0); // Round to start of the hour
//             hourlyData[bucketTime.getTime()] = [];
//         }

//         // Step 3: Assign record to nearest hour (rounding to floor hour)
//         records.forEach(record => {
//             const createdAt = new Date(record.createdAt);
//             createdAt.setMinutes(0, 0, 0); // Round down to the start of the hour
//             const bucketTimestamp = createdAt.getTime();

//             if (hourlyData.hasOwnProperty(bucketTimestamp)) {
//                 // hourlyData[bucketTimestamp] = record; // You can also store a list or latest value here
//                 if (!hourlyData[bucketTimestamp]) {
//                     hourlyData[bucketTimestamp] = [];
//                 }
//                 hourlyData[bucketTimestamp].push(record);
//             }
//         });

//         // Step 4: Convert map to array with readable IST timestamps
//         const response = Object.keys(hourlyData)
//             .sort((a, b) => b - a) // Latest first
//             .map(timestamp => ({
//                 timestamp: new Date(parseInt(timestamp)), // Convert timestamp back to date
//                 // timestamp: toIST(parseInt(timestamp)),
//                 data: hourlyData[timestamp] || {}
//             }));

//         return response;
//     } catch (error) {
//         // console.error(`[${toIST(new Date())}] Error fetching last 24 hours data:`, error);
//         console.error(`[${new Date().toISOString()}] Error fetching last 24 hours data:`, error);
//         return [];
//     }
// }

module.exports = { initializeSocket, sendRealTimeData, getLast24HoursDataAPI };