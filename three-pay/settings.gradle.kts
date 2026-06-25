pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google(); mavenCentral()
        // SDK Cielo Order Manager está no Maven Central (com.cielo.lio:order-manager).
        // Se a homologação indicar um repo privado, adicione aqui.
    }
}
rootProject.name = "ThreePay"
include(":app")
