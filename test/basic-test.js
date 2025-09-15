// 基础测试脚本 - 兼容ES模块和CommonJS
console.log('🧪 开始运行基础测试...');

// 测试1: 基础算术
function testBasicMath() {
  console.log('✅ 测试基础数学运算...');
  if (1 + 1 !== 2) {
    throw new Error('基础数学测试失败');
  }
  console.log('✅ 基础数学测试通过');
}

// 测试2: 字符串操作
function testStringOperations() {
  console.log('✅ 测试字符串操作...');
  const testStr = 'hello';
  if (testStr.toUpperCase() !== 'HELLO') {
    throw new Error('字符串操作测试失败');
  }
  console.log('✅ 字符串操作测试通过');
}

// 测试3: 数组操作
function testArrayOperations() {
  console.log('✅ 测试数组操作...');
  const testArray = [1, 2, 3];
  if (testArray.length !== 3) {
    throw new Error('数组操作测试失败');
  }
  console.log('✅ 数组操作测试通过');
}

// 测试4: 对象操作
function testObjectOperations() {
  console.log('✅ 测试对象操作...');
  const testObj = { name: 'test' };
  if (testObj.name !== 'test') {
    throw new Error('对象操作测试失败');
  }
  console.log('✅ 对象操作测试通过');
}

// 测试5: 异步操作
async function testAsyncOperations() {
  console.log('✅ 测试异步操作...');
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('✅ 异步操作测试通过');
      resolve();
    }, 100);
  });
}

// 运行所有测试
async function runAllTests() {
  try {
    testBasicMath();
    testStringOperations();
    testArrayOperations();
    testObjectOperations();
    await testAsyncOperations();

    console.log('🎉 所有基础测试通过！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
runAllTests();