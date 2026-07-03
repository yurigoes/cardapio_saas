import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Carrega local.properties manualmente — o Gradle NÃO expõe esse arquivo via
// project.findProperty (só gradle.properties). É aqui que ficam as credenciais
// Cielo e os dados da chave de assinatura (arquivo fora do controle de versão).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun prop(name: String): String? = localProps.getProperty(name) ?: (project.findProperty(name) as String?)

android {
    namespace = "com.threedigital.threepay"
    compileSdk = 34

    defaultConfig {
        // applicationId casa com o package do Client-ID/app cadastrado na Cielo.
        applicationId = "com.threedigital.threepay"
        minSdk = 25   // exigido pelo SDK Cielo Order Manager
        targetSdk = 34
        versionCode = 6
        versionName = "1.5"
        // Defaults — sobrescreva em local.properties / na tela de pareamento
        buildConfigField("String", "BACKEND_URL", "\"https://app.tthreedigital.com.br\"")
        // Credenciais Cielo (Dev Portal > Perfil > Client-IDs Cadastrados).
        // Coloque os valores reais em local.properties (CIELO_CLIENT_ID / CIELO_ACCESS_TOKEN)
        // e leia via gradle; aqui ficam placeholders pra compilar.
        buildConfigField("String", "CIELO_CLIENT_ID",    "\"${prop("CIELO_CLIENT_ID") ?: ""}\"")
        buildConfigField("String", "CIELO_ACCESS_TOKEN", "\"${prop("CIELO_ACCESS_TOKEN") ?: ""}\"")
    }

    val temKeystore = prop("RELEASE_STORE_FILE") != null
    signingConfigs {
        if (temKeystore) {
            create("release") {
                storeFile = rootProject.file(prop("RELEASE_STORE_FILE")!!)
                storePassword = prop("RELEASE_STORE_PASSWORD")
                keyAlias = prop("RELEASE_KEY_ALIAS")
                keyPassword = prop("RELEASE_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            // A Cielo travou o certificado da 1ª versão (assinada com a chave de DEBUG
            // padrão do Android). Atualizações DEVEM usar o MESMO certificado, então
            // mantemos a assinatura debug aqui. (temKeystore fica disponível p/ futuro.)
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    // SDK Cielo Order Manager — distribuído como AAR LOCAL (não está no Maven).
    // Baixe order-manager-2.7.2.aar e coloque em three-pay/app/libs/
    //   Fonte: github.com/DeveloperCielo/LIO-SDK-Sample-Integracao-Local/tree/master/app/libs
    //   (ou o pacote do SDK no portal de desenvolvedores Cielo)
    implementation(files("libs/order-manager-2.7.2.aar"))
    // Dependências transitivas que o SDK costuma exigir (o AAR local não as puxa):
    implementation("com.google.code.gson:gson:2.10.1")
}
