import { ConfigPlugin } from "expo/config-plugins";

interface CustomCACert {
    /** Resource name for the certificate (without extension) */
    name: string;
    /** Path to the certificate file relative to project root */
    path: string;
}

interface PluginProps {
    /** Array of custom CA certificates to bundle into the app */
    customCACerts?: CustomCACert[];
    /**
     * Add the iOS AppDelegate method that hands the library the events of a
     * background download (`config({background})`) that ended while the app was
     * not running. Default true.
     */
    iosBackgroundSessions?: boolean;
}

declare const withReactNativeBlobUtil: ConfigPlugin<PluginProps>;
export default withReactNativeBlobUtil;
