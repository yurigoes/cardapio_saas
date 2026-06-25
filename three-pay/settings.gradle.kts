pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google(); mavenCentral()
        // TODO: adicionar o repositório do SDK Cielo Order Manager (fornecido na homologação)
        // maven { url = uri("https://...") }
    }
}
rootProject.name = "ThreePay"
include(":app")
