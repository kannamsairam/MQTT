const deviceModel = require('../models/deviceModel');
const userModel = require('../models/userModel');

exports.createDevice = async (deviceData) => {
    let { userUUID, deviceName, deviceID } = deviceData;

    // Convert deviceID to lowercase
    if (deviceID) {
        deviceData.deviceID = deviceID.toLowerCase();
    }

    // Validating input
    if (!deviceData.deviceID || !userUUID || !deviceName) {
        throw new Error('DeviceID, name, UUID are required')
    }

    const UUIDExists = await userModel.findOne({ uuid: userUUID });
    if(!UUIDExists) {
        throw new Error('User does not exist');
    }
    
    // Checking if the deviceID already exists
    const existingDevice = await deviceModel.findOne({ deviceID });
    if (existingDevice) {
        throw new Error('DeviceID already in use')
    }

    const newDevice = new deviceModel(deviceData);
    return await newDevice.save();
}

exports.getAllDevices = async (UUID) => {
    const devices = await deviceModel.find({ userUUID: UUID });
    return devices;
}

exports.getDeviceByID = async (deviceID) => {
    const device = await deviceModel.findOne({ deviceID });
    return device;
}

exports.recovery = async ( mobile ) => {
    const user = await userModel.findOne({mobile});
    console.log(user);
    return user;
}

exports.deleteDevice = async (deviceID) => {
    const device = await deviceModel.findOne({ deviceID });
    if (!device) throw new Error('Device not found');
    
    await deviceModel.deleteOne({ deviceID });
    return device;
}