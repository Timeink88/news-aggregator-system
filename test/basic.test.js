import { jest } from '@jest/globals';

describe('基础测试', () => {
  test('测试Jest是否正常工作', () => {
    expect(1 + 1).toBe(2);
  });

  test('测试环境变量设置', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  test('测试模拟函数', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});