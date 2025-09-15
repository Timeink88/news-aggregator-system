/**
 * 断路器模式实现
 * 用于保护系统免受级联故障的影响
 */

/**
 * 断路器状态枚举
 */
const CircuitState = {
  CLOSED: 'CLOSED',      // 关闭状态：正常工作
  OPEN: 'OPEN',         // 开启状态：快速失败
  HALF_OPEN: 'HALF_OPEN' // 半开状态：尝试恢复
};

/**
 * 断路器类
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 30000,           // 超时时间（毫秒）
      errorThresholdPercentage: options.errorThresholdPercentage || 50,  // 错误阈值百分比
      resetTimeout: options.resetTimeout || 60000, // 重置超时时间（毫秒）
      monitoringPeriod: options.monitoringPeriod || 60000, // 监控周期（毫秒）
      maxRequests: options.maxRequests || 10,     // 最大请求数
      ...options
    };

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.monitoringStartTime = Date.now();

    // 事件监听器
    this.eventListeners = {
      open: [],
      close: [],
      halfOpen: [],
      success: [],
      failure: [],
      timeout: []
    };
  }

  /**
   * 执行受保护的函数
   */
  async execute(fn, ...args) {
    // 检查断路器状态
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.setState(CircuitState.HALF_OPEN);
    }

    this.requestCount++;
    const startTime = Date.now();

    try {
      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timeout after ${this.options.timeout}ms`));
        }, this.options.timeout);
      });

      // 执行函数
      const result = await Promise.race([
        fn(...args),
        timeoutPromise
      ]);

      const executionTime = Date.now() - startTime;
      this.onSuccess(executionTime);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.onFailure(error, executionTime);
      throw error;
    }
  }

  /**
   * 成功回调
   */
  onSuccess(executionTime) {
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.setState(CircuitState.CLOSED);
    }

    this.emit('success', {
      executionTime,
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount
    });
  }

  /**
   * 失败回调
   */
  onFailure(error, executionTime) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // 检查是否需要开启断路器
    if (this.shouldOpenCircuit()) {
      this.setState(CircuitState.OPEN);
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
    }

    this.emit('failure', {
      error,
      executionTime,
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount
    });
  }

  /**
   * 检查是否应该开启断路器
   */
  shouldOpenCircuit() {
    if (this.state === CircuitState.OPEN) {
      return false;
    }

    // 检查请求是否足够
    if (this.requestCount < this.options.maxRequests) {
      return false;
    }

    // 检查错误率
    const errorRate = (this.failureCount / this.requestCount) * 100;
    return errorRate >= this.options.errorThresholdPercentage;
  }

  /**
   * 设置断路器状态
   */
  setState(newState) {
    if (this.state === newState) {
      return;
    }

    const oldState = this.state;
    this.state = newState;

    // 重置计数器
    if (newState === CircuitState.CLOSED) {
      this.reset();
    }

    // 发出状态变更事件
    this.emit(newState, {
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });
  }

  /**
   * 重置断路器
   */
  reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.monitoringStartTime = Date.now();
  }

  /**
   * 获取断路器状态
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      errorRate: this.requestCount > 0 ? (this.failureCount / this.requestCount) * 100 : 0,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      uptime: Date.now() - this.monitoringStartTime
    };
  }

  /**
   * 强制开启断路器
   */
  forceOpen() {
    this.setState(CircuitState.OPEN);
    this.nextAttemptTime = Date.now() + this.options.resetTimeout;
  }

  /**
   * 强制关闭断路器
   */
  forceClose() {
    this.setState(CircuitState.CLOSED);
  }

  /**
   * 添加事件监听器
   */
  on(event, listener) {
    if (!this.eventListeners[event]) {
      return;
    }
    this.eventListeners[event].push(listener);
  }

  /**
   * 移除事件监听器
   */
  off(event, listener) {
    if (!this.eventListeners[event]) {
      return;
    }
    const index = this.eventListeners[event].indexOf(listener);
    if (index > -1) {
      this.eventListeners[event].splice(index, 1);
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (!this.eventListeners[event]) {
      return;
    }
    this.eventListeners[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Circuit breaker event listener error: ${error.message}`);
      }
    });
  }

  /**
   * 获取健康状态
   */
  getHealth() {
    const state = this.getState();

    return {
      status: state.state === CircuitState.CLOSED ? 'healthy' : 'unhealthy',
      state: state.state,
      metrics: {
        totalRequests: state.requestCount,
        successfulRequests: state.successCount,
        failedRequests: state.failureCount,
        errorRate: state.errorRate,
        uptime: state.uptime
      },
      config: {
        timeout: this.options.timeout,
        errorThresholdPercentage: this.options.errorThresholdPercentage,
        resetTimeout: this.options.resetTimeout
      }
    };
  }
}

/**
 * 断路器工厂函数
 */
export function createCircuitBreaker(options = {}) {
  return new CircuitBreaker(options);
}

/**
 * 装饰器：为函数添加断路器保护
 */
export function withCircuitBreaker(breakerOrOptions) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const breaker = typeof breakerOrOptions === 'object'
      ? new CircuitBreaker(breakerOrOptions)
      : breakerOrOptions;

    descriptor.value = async function(...args) {
      return breaker.execute(originalMethod.bind(this), ...args);
    };

    return descriptor;
  };
}

/**
 * 批量断路器管理器
 */
export class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * 获取或创建断路器
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(options));
    }
    return this.breakers.get(name);
  }

  /**
   * 移除断路器
   */
  removeBreaker(name) {
    this.breakers.delete(name);
  }

  /**
   * 获取所有断路器状态
   */
  getAllStates() {
    const states = {};
    for (const [name, breaker] of this.breakers) {
      states[name] = breaker.getState();
    }
    return states;
  }

  /**
   * 获取所有断路器健康状态
   */
  getAllHealth() {
    const health = {};
    for (const [name, breaker] of this.breakers) {
      health[name] = breaker.getHealth();
    }
    return health;
  }

  /**
   * 重置所有断路器
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
  }

  /**
   * 强制开启所有断路器
   */
  forceOpenAll() {
    for (const breaker of this.breakers.values()) {
      breaker.forceOpen();
    }
  }
}

// 导出单例实例
export const circuitBreakerManager = new CircuitBreakerManager();

// 导出常量
export { CircuitState };

// 默认导出
export default CircuitBreaker;