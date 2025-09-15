/**
 * 验证器工具模块
 * 提供各种数据验证功能
 */

/**
 * 验证URL格式
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch (error) {
    return false;
  }
}

/**
 * 验证邮箱格式
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证RSS源URL
 */
export function validateRSSUrl(url) {
  if (!validateUrl(url)) {
    return false;
  }

  // 检查常见的RSS文件扩展名
  const rssExtensions = ['.rss', '.xml', '.atom', '.rdf'];
  const urlObj = new URL(url);
  const pathname = urlObj.pathname.toLowerCase();

  return rssExtensions.some(ext => pathname.endsWith(ext)) ||
         pathname.includes('rss') ||
         pathname.includes('feed') ||
         pathname.includes('atom');
}

/**
 * 验证UUID格式
 */
export function validateUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 验证日期格式
 */
export function validateDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }

  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * 验证文章内容
 */
export function validateArticle(article) {
  if (!article || typeof article !== 'object') {
    return false;
  }

  const required = ['title', 'url', 'source_id'];
  return required.every(field => article[field]);
}

/**
 * 验证RSS源配置
 */
export function validateRSSSource(source) {
  if (!source || typeof source !== 'object') {
    return false;
  }

  const required = ['name', 'url', 'category'];
  return required.every(field => source[field]) && validateRSSUrl(source.url);
}

/**
 * 验证字符串长度
 */
export function validateLength(text, min = 0, max = Infinity) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const length = text.length;
  return length >= min && length <= max;
}

/**
 * 验证字符串不为空
 */
export function validateNonEmpty(text) {
  return text && typeof text === 'string' && text.trim().length > 0;
}

/**
 * 验证数字范围
 */
export function validateNumber(num, min = -Infinity, max = Infinity) {
  if (typeof num !== 'number' || isNaN(num)) {
    return false;
  }

  return num >= min && num <= max;
}

/**
 * 验证布尔值
 */
export function validateBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * 验证数组
 */
export function validateArray(arr, min = 0, max = Infinity) {
  if (!Array.isArray(arr)) {
    return false;
  }

  return arr.length >= min && arr.length <= max;
}

/**
 * 验证对象
 */
export function validateObject(obj, requiredKeys = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  return requiredKeys.every(key => key in obj);
}

/**
 * 验证密码强度
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return false;
  }

  // 至少8个字符，包含大小写字母、数字和特殊字符
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return password.length >= minLength &&
         hasUpperCase &&
         hasLowerCase &&
         hasNumbers &&
         hasSpecialChar;
}

/**
 * 验证用户名
 */
export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // 只允许字母、数字、下划线，长度3-20
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

/**
 * 验证手机号（中国）
 */
export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

/**
 * 验证IP地址
 */
export function validateIPAddress(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}$/i;

  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * 验证端口号
 */
export function validatePort(port) {
  return validateNumber(port, 1, 65535);
}

/**
 * 验证域名
 */
export function validateDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * 验证文件大小（字节）
 */
export function validateFileSize(size, maxSize) {
  return validateNumber(size, 0, maxSize);
}

/**
 * 验证文件类型
 */
export function validateFileType(filename, allowedTypes) {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  const extension = filename.split('.').pop().toLowerCase();
  return allowedTypes.includes(extension);
}

/**
 * 验证JSON格式
 */
export function validateJSON(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return false;
  }

  try {
    JSON.parse(jsonString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 验证Base64编码
 */
export function validateBase64(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    return false;
  }

  try {
    Buffer.from(base64String, 'base64');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 批量验证
 */
export function validateBatch(items, validator, ...validatorArgs) {
  if (!Array.isArray(items)) {
    return { valid: false, errors: ['输入不是数组'] };
  }

  const errors = [];
  const validItems = [];

  items.forEach((item, index) => {
    try {
      if (validator(item, ...validatorArgs)) {
        validItems.push(item);
      } else {
        errors.push(`第${index + 1}项验证失败`);
      }
    } catch (error) {
      errors.push(`第${index + 1}项验证错误: ${error.message}`);
    }
  });

  return {
    valid: errors.length === 0,
    validItems,
    errors,
    errorRate: items.length > 0 ? (errors.length / items.length) * 100 : 0
  };
}