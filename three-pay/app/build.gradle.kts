plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.threedigital.threepay"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.threedigital.threepay"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // Defaults — sobrescreva em local.properties / na tela de pareamento
        buildConfigField("String", "BACKEND_URL", "\"https://midiaindoor.tthreedigital.com.br\"")
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
    // TODO: SDK Cielo Order Manager (fornecido na homologação Cielo)
    // implementation("br.com.cielo:order-manager:<versao>")
}
