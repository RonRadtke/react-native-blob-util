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
}

declare const withCustomCACerts: ConfigPlugin<PluginProps>;
export default withCustomCACerts;
