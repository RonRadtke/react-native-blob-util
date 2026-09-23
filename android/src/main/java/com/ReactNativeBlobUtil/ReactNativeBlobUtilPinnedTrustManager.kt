package com.ReactNativeBlobUtil

import java.net.Socket
import java.security.cert.X509Certificate
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509ExtendedTrustManager
import javax.net.ssl.X509TrustManager

/**
 * Trust for customCACerts scoped to pinnedHosts, decided per TLS handshake.
 *
 * The request used to pick its trust once, from the first URL's host: a request
 * that started at an unpinned host and was redirected to a pinned one reached
 * the pinned host with system trust, so any publicly trusted certificate for it
 * passed. This trust manager asks which host each handshake is for - redirects
 * included - and checks pinned hosts against the custom CAs and every other
 * host against the system's, as iOS does per challenge. A handshake whose host
 * cannot be told is checked against the custom CAs: fail closed.
 */
internal class ReactNativeBlobUtilPinnedTrustManager(
    private val custom: X509TrustManager,
    private val system: X509TrustManager,
    private val pinnedHosts: List<String?>,
) : X509ExtendedTrustManager() {

    fun trustManagerFor(host: String?): X509TrustManager =
        if (host == null || pinnedHosts.any { it != null && it.equals(host, ignoreCase = true) }) custom else system

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String, socket: Socket?) {
        val tm = trustManagerFor((socket as? SSLSocket)?.handshakeSession?.peerHost)
        if (tm is X509ExtendedTrustManager) tm.checkServerTrusted(chain, authType, socket) else tm.checkServerTrusted(chain, authType)
    }

    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String, engine: SSLEngine?) {
        val tm = trustManagerFor(engine?.peerHost)
        if (tm is X509ExtendedTrustManager) tm.checkServerTrusted(chain, authType, engine) else tm.checkServerTrusted(chain, authType)
    }

    // No host to go by.
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) =
        custom.checkServerTrusted(chain, authType)

    // Client certificates are not part of this; the system decides as it would.
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String, socket: Socket?) =
        system.checkClientTrusted(chain, authType)

    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String, engine: SSLEngine?) =
        system.checkClientTrusted(chain, authType)

    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) =
        system.checkClientTrusted(chain, authType)

    override fun getAcceptedIssuers(): Array<X509Certificate> = custom.acceptedIssuers + system.acceptedIssuers
}
