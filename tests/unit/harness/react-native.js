/**
 * The `react-native` the package sees under `npm test`: just enough of
 * Platform, TurboModuleRegistry and NativeEventEmitter for the JavaScript to
 * run, with handles for a test to drive them.
 *
 *   import rn from '../harness/react-native.js';
 *   rn.setPlatform('android');
 *   rn.setNativeModule({fetchBlob(...) {...}});
 *   rn.emit('ReactNativeBlobUtilState', {taskId, ...});
 */
const listeners = new Map();

export const Platform = {
    OS: 'android',
    select(spec) {
        return spec[Platform.OS] !== undefined ? spec[Platform.OS] : spec.default;
    },
};

let nativeModule = null;

export const TurboModuleRegistry = {
    get(name) {
        return name === 'ReactNativeBlobUtil' ? nativeModule : null;
    },
    getEnforcing(name) {
        const found = TurboModuleRegistry.get(name);
        if (found == null) throw new Error(`TurboModuleRegistry.getEnforcing(...): '${name}' could not be found.`);
        return found;
    },
};

export class NativeEventEmitter {
    constructor(module) {
        if (module == null) throw new Error('`new NativeEventEmitter()` requires a non-null argument.');
    }

    addListener(eventName, handler) {
        if (!listeners.has(eventName)) listeners.set(eventName, new Set());
        listeners.get(eventName).add(handler);
        return {
            remove() {
                listeners.get(eventName)?.delete(handler);
            },
        };
    }
}

function setPlatform(os) {
    Platform.OS = os;
}

/** Replaces the native module (null makes it unavailable, as before registration). */
function setNativeModule(module) {
    nativeModule = module;
}

/** Delivers an event to every subscribed listener, the way RN would. */
function emit(eventName, payload) {
    for (const handler of [...(listeners.get(eventName) ?? [])]) {
        handler(payload);
    }
}

/** How many listeners are subscribed to an event; what a leak test counts. */
function listenerCount(eventName) {
    return listeners.get(eventName)?.size ?? 0;
}

export default {Platform, TurboModuleRegistry, NativeEventEmitter, setPlatform, setNativeModule, emit, listenerCount};
