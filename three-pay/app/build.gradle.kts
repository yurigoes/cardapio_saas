plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.threedigital.threepay"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.threedigital.threepay"
        minSdk = 25   // exigido pelo SDK Cielo Order Manager
        targetSdk = 34
        versionCode = 2
        versionName = "1.1"
        // Defaults — sobrescreva em local.properties / na tela de pareamento
        buildConfigField("String", "BACKEND_URL", "\"https://midiaindoor.tthreedigital.com.br\"")
        // Credenciais Cielo (Dev Portal > Perfil > Client-IDs Cadastrados).
        // Coloque os valores reais em local.properties (CIELO_CLIENT_ID / CIELO_ACCESS_TOKEN)
        // e leia via gradle; aqui ficam placeholders pra compilar.
        buildConfigField("String", "CIELO_CLIENT_ID",    "\"${project.findProperty("CIELO_CLIENT_ID") ?: ""}\"")
        buildConfigField("String", "CIELO_ACCESS_TOKEN", "\"${project.findProperty("CIELO_ACCESS_TOKEN") ?: ""}\"")
    }
    buildTypes {
        release {
            isMinifyEnabled = false
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
