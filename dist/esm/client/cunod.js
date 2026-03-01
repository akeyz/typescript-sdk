import * as crypto from "node:crypto";
/**
 * 压缩JSON数据，移除多余空格
 * @param jsonData - JSON字符串或对象
 * @returns 压缩后的JSON字符串
 * @throws 如果输入的JSON格式无效
 */
function compressJSON(jsonData) {
    if (jsonData === null || jsonData === undefined) {
        return "";
    }
    try {
        // 如果输入是字符串，先解析成对象
        const obj = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
        // 将对象转换为压缩后的JSON字符串
        return JSON.stringify(obj);
    }
    catch (error) {
        throw new Error(`无效的JSON数据: ${error.message}`);
    }
}
// 格式化时间戳函数
function generateTimestamp() {
    const date = new Date();
    // 获取年月日
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    // 获取时分秒
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    // 获取毫秒
    const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
    // 组合成最终格式
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${milliseconds}`;
}
// 生成时间戳加随机数函数
function generateTransId() {
    // 获取当前时间戳
    const timestamp = Date.now();
    // 生成6位随机数
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    // 拼接时间戳和随机数
    return `${timestamp}${randomNum}`;
}
/**
 * 计算字符串的MD5值
 * @param str - 需要计算MD5的字符串
 * @returns Promise<string> - 返回32位小写MD5值
 */
function getMD5(str) {
    return crypto.createHash("md5").update(str).digest("hex");
}
/**
 * 计算字符串的Base64值
 * @param str
 * @returns
 */
function getBase64(str) {
    // 将JSON字符串转换为Buffer
    const buffer = Buffer.from(str);
    // 转换为base64字符串
    return buffer.toString("base64");
}
export function generateAuthentication(appId, appSecret, bodyParams) {
    const currentTimeStamp = generateTimestamp();
    const currentTransId = generateTransId();
    const token = getMD5(`APP_ID${appId}TIMESTAMP${currentTimeStamp}TRANS_ID${currentTransId}${compressJSON(bodyParams)}${appSecret}`);
    const queryParamsString = compressJSON({
        APP_ID: appId,
        TIMESTAMP: currentTimeStamp,
        TRANS_ID: currentTransId,
        TOKEN: token,
    });
    return getBase64(queryParamsString);
}
//# sourceMappingURL=cunod.js.map