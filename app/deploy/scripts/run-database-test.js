import DatabaseTester from './test-database.js';

const tester = new DatabaseTester();

// 初始化连接
tester.initialize().then(initialized => {
  if (!initialized) {
    console.log('❌ 数据库连接初始化失败，跳过其他测试');
    process.exit(1);
  }

  // 运行测试
  return tester.runTests();
}).then(allTestsPassed => {
  // 生成报告
  tester.generateReport();

  // 关闭连接
  return tester.shutdown();
}).then(() => {
  console.log('🎉 数据库测试完成');
  process.exit(0);
}).catch(error => {
  console.error('❌ 数据库测试失败:', error);
  process.exit(1);
});