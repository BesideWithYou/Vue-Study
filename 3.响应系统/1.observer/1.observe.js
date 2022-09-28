// 存储副作用函数的桶
const bucket = new WeakMap();
// 一个全局变量来存储被注册的副作用函数
let activeEffect;

// 原始数据
const data = { text: "hello world" };
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

// 这个函数会直接或者间接影响别的函数的执行结果，就是一个副作用函数
// 当调用 effect 注册副作用函数时，将副作用函数 fn 赋值给 activeEffect
function effect(fn) {
  const effectFn = () => {
    // 调用 cleanup 完成清除工作
    cleanup(effectFn);
    // 当 effectFn 执行的时候，将其设置为当前激活的副作用函数
    activeEffect = effectFn;
    fn();
  };

  // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = [];
  effectFn();
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
  // Set
  let effectsDeps = depsMap.get(key);
  // 如果 deps 不存在，就新建一个 Set 与 key 进行关联
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
  const effectsToRun = new Set(effects);

  // 把副作用函数从桶里取出并执行
  effectsToRun && effectsToRun.forEach((fn) => fn());
  // 执行成功
  return true;
}

effect(() => {
  console.log("effect run");
  document.body.innerText = obj.text;
});

setTimeout(() => {
  obj.text = "hello Wang";
}, 2000);
