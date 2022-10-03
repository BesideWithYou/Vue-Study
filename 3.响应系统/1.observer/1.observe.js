// 存储副作用函数的桶
const bucket = new WeakMap();

// 原始数据
const data = { text: "hello world", foo: 1 };

// 对原始数据进行代理
const obj = new Proxy(data, {
  // 拦截读取操作
  get(target, key) {
    // 将副作用函数activeEffect添加到存储桶里
    tracker(target, key);

    // 返回属性
    return target[key];
  },
  // 拦截设置操作
  set(target, key, newVal) {
    // 设置属性
    target[key] = newVal;
    // 把副作用函数从桶里取出执行
    trigger(target, key);
  },
});

// 一个全局变量来存储被注册的副作用函数
let activeEffect;
// effect stack ，用来防止 effect 嵌套的情况
const effectStack = [];

// 这个函数会直接或者间接影响别的函数的执行结果，就是一个副作用函数
// 当调用 effect 注册副作用函数时，将副作用函数 fn 赋值给 activeEffect
function effect(fn, options = {}) {
  const effectFn = () => {
    // 调用 cleanup 完成清除工作
    cleanup(effectFn);
    // 当 effectFn 执行的时候，将其设置为当前激活的副作用函数
    activeEffect = effectFn;
    // 调用副作用函数之前将当前副作用函数入栈
    effectStack.push(effectFn);
    // 存储 fn 的执行结果到 res 中
    const res = fn();
    // 执行完当前副作用函数之后将其出栈，然后把当前激活的副作用函数还原到上一个值
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    // 将 res 作为 effectFn 的返回值
    return res;
  };

  // 将 options 挂载到 effectFn 上
  effectFn.options = options;
  // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = [];

  // 只有不是lazy的时候才会执行
  if (!options.lazy) {
    effectFn();
  }

  // lazy 的时候就返回副作用函数
  return effectFn;
}

function computed(getter) {
  // value 用来缓存上一次计算的值
  let value;
  // dirty 识别是否需要重新计算值， true 意味着数据脏了，需要重新计算
  let dirty = true;
  // getter 作为副作用函数
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        // 当计算属性依赖的响应式数据发生变化时，手动调用 trigger 函数触发响应
        trigger(obj, "value");
      }
    },
  });

  const obj = {
    // 当读取 value 的时候菜执行 effectFn
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      // 当读取 value 时，手动调用 track 函数进行追踪
      tracker(obj, "value");
      return value;
    },
  };

  return obj;
}

function cleanup(effectFn) {
  // 遍历 effect.deps 数组
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖的数组集合
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }

  // 最后重置 effect.deps 数组
  effectFn.deps.length = 0;
}

// 在 get 拦截函数内调用 track 函数进行追踪变化
function tracker(target, key) {
  if (!activeEffect) return;
  // 根据 target 从桶里取得 depsMap, 里面的结构是 key -> effects
  let depsMap = bucket.get(target);
  // 如果不存在 depsMap，新建一个 Map 与 target 进行关联
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  // 再根据 key 从 depsMap 里取得对应的 deps，他是一个 Set 类型，里面存储着所有与当前 key 相关联的 effect
  // 从 depsMap 里面取出 Set 数据结构
  let effectsDeps = depsMap.get(key);
  // 如果 effectsDeps 不存在，就新建一个 Set 与 key 进行关联
  if (!effectsDeps) {
    depsMap.set(key, (effectsDeps = new Set()));
  }
  // 最后将当前激活的副作用函数添加到桶里
  effectsDeps.add(activeEffect);

  // deps 是一个与当前副作用函数存在联系的依赖集合
  activeEffect.deps.push(effectsDeps);
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger(target, key) {
  // 根据 target 去桶里取对应的副作用函数
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const effects = depsMap.get(key);

  // 用来避免无限循环的
  const effectsToRun = new Set();

  // 如果 trigger 触发的副作用函数与当前执行的副作用函数相同，
  // 则不触发执行，防止 effect 里执行 obj.foo++ 产生无限递归
  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn);
      }
    });

  // 把副作用函数从桶里取出并执行
  effectsToRun &&
    effectsToRun.forEach((effectFn) => {
      // 如果一个副作用函数里存在调度器，则调用，并将副作用函数作为参数传递
      if (effectFn.options.scheduler) {
        effectFn.options.scheduler(effectFn);
      } else {
        // 否则就直接执行副作用函数
        effectFn();
      }
    });
  // 执行成功
  return true;
}

effect(
  () => {
    console.log(obj.foo);
  },
  {
    scheduler(fn) {
      setTimeout(fn);
    },
  }
);

obj.foo++;

console.log("结束了");
