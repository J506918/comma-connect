'use strict';
// Web mock for react-native-reanimated
// This app only uses React Native's built-in Animated API, not reanimated
// This mock prevents crashes when reanimated tries to initialize native modules on web

const noop = () => {};
const noopReturn = (v) => v;

module.exports = {
  __esModule: true,
  default: {},
  useSharedValue: (v) => ({ value: v }),
  useAnimatedStyle: () => ({}),
  withTiming: noopReturn,
  withSpring: noopReturn,
  withDelay: noopReturn,
  withRepeat: noopReturn,
  withSequence: noopReturn,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  cancelAnimation: noop,
  createAnimatedComponent: (C) => C,
  Easing: {
    linear: noopReturn,
    ease: noopReturn,
    quad: noopReturn,
    cubic: noopReturn,
    inOut: noopReturn,
    in: noopReturn,
    out: noopReturn,
    bezier: () => noopReturn,
    circle: noopReturn,
    sin: noopReturn,
    exp: noopReturn,
    elastic: () => noopReturn,
    bounce: noopReturn,
    back: () => noopReturn,
    poly: () => noopReturn,
    step0: noopReturn,
    step1: noopReturn,
  },
};
