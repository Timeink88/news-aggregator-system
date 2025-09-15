import SchemaValidator from './validate-schema.js';

const validator = new SchemaValidator();
validator.validate().then(result => {
  console.log('验证结果:', result ? '成功' : '失败');
  process.exit(result ? 0 : 1);
}).catch(error => {
  console.error('验证运行失败:', error);
  process.exit(1);
});