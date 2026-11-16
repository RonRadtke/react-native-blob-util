/**
 * `codegenSpecs/NativeBlobUtils` resolves the TurboModule once, at module
 * evaluation, and default-exports the result:
 *
 *   export default (TurboModuleRegistry.get<Spec>('ReactNativeBlobUtil'): ?Spec);
 *
 * `get()` is nullable (unlike `getEnforcing()`), so on the New Architecture
 * that lookup can yield null - and because it runs once, every importer then
 * holds a permanently null binding even if the module registers later.
 *
 * Resolve through here instead. The lookup is retried until it produces a
 * module, and nothing reaches native at import time, so importing the package
 * can no longer throw. The eager export stays in the spec file untouched:
 * RN's codegen parses that call to discover the module name.
 */
import {NativeEventEmitter, TurboModuleRegistry} from 'react-native';

let nativeModule = null;
let eventEmitter = null;

/**
 * The native module, or null when it is not registered (yet).
 * Use this where absence is a case to handle rather than an error.
 */
function getNativeModule() {
    if (nativeModule == null) {
        nativeModule = TurboModuleRegistry.get('ReactNativeBlobUtil');
    }

    return nativeModule;
}

/**
 * The native module, throwing a descriptive error when it cannot be resolved.
 * Use this at call sites that cannot proceed without it.
 */
function requireNativeModule() {
    const resolved = getNativeModule();

    if (resolved == null) {
        throw new Error(
            'react-native-blob-util: the native module is not available. ' +
            'Rebuild the app after installing the package and make sure ' +
            'autolinking picked it up - a JS-only reload is not enough.'
        );
    }

    ensureMessageChannel(resolved);

    if (wrappedFor !== resolved) {
        wrapped = withErrorRejections(resolved);
        wrappedFor = resolved;
    }
    return wrapped;
}

let wrapped = null;
let wrappedFor = null;

/**
 * An Error for what a native promise rejected with. Windows rejects with a
 * plain object, {code, message}, where Android and iOS reject with an Error,
 * so `err instanceof Error` was false there and the rejection had no name or
 * stack. The fields it carried are kept.
 */
function asError(reason) {
    if (reason == null || typeof reason !== 'object' || reason instanceof Error) {
        return reason;
    }
    const error = new Error(reason.message == null ? '' : String(reason.message));
    for (const key of Object.keys(reason)) {
        if (key !== 'message') {
            error[key] = reason[key];
        }
    }
    return error;
}

/** The module, with every promise it returns rejecting with an Error. */
function withErrorRejections(module) {
    return new Proxy(module, {
        get(target, prop) {
            const value = target[prop];
            if (typeof value !== 'function') {
                return value;
            }
            return (...args) => {
                const result = value.apply(target, args);
                return result != null && typeof result.then === 'function'
                    ? result.then(undefined, (reason) => { throw asError(reason); })
                    : result;
            };
        },
    });
}

/**
 * The shared event emitter, built on first native access.
 *
 * Constructing it at import time is what made a bridgeless cold start crash:
 * NativeEventEmitter throws on iOS when handed a null module, and the spec's
 * lookup may not have resolved yet.
 */
function getEventEmitter() {
    requireNativeModule();

    return eventEmitter;
}

/**
 * The `ReactNativeBlobUtilMessage` diagnostic channel used to be subscribed
 * when fetch.js was imported. Attaching it on first native access keeps it
 * registered exactly once, and keeps it working for consumers that only touch
 * the fs API - ios/ReactNativeBlobUtilFS.mm emits on this channel too.
 */
function ensureMessageChannel(resolved) {
    if (eventEmitter != null) {
        return;
    }

    eventEmitter = new NativeEventEmitter(resolved);

    eventEmitter.addListener('ReactNativeBlobUtilMessage', (e) => {
        if (typeof e === 'string') e = JSON.parse(e);

        if (e.event === 'warn') {
            console.warn(e.detail);
        }
        else if (e.event === 'error') {
            // Reported, not thrown: a throw inside an event listener is an
            // uncaught exception that takes the app down.
            console.error('ReactNativeBlobUtil native error', e.detail);
        }
        else {
            console.log('ReactNativeBlobUtil native message', e.detail);
        }
    });
}

export {getNativeModule, requireNativeModule, getEventEmitter};
export default requireNativeModule;
