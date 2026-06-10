# Three Launcher

Launcher Android customizado pra TV-boxes da Three Digital Mídia.

## O que mostra

- Relógio gigante (HH:mm) + data por extenso
- Status Wi-Fi (SSID conectado) no topo direito
- 4 botões: Xibo, RustDesk, Configurações, Reiniciar
- Wallpaper customizado (PNG/JPG carregado de `/sdcard/three_wallpaper.png`)
- Auto-launch Xibo após 30s sem toque

## Build

Pré-requisitos: Android Studio (qualquer versão recente) OU JDK 17 + Android SDK 34.

**Via Android Studio:**
1. Abrir esta pasta como projeto
2. Aguardar Gradle sync
3. Menu Build > Build Bundle(s) / APK(s) > Build APK(s)
4. APK fica em `app/build/outputs/apk/release/app-release.apk`

**Via CLI** (precisa ter Android SDK no PATH):
```bash
./gradlew assembleRelease   # Linux/Mac
gradlew.bat assembleRelease # Windows
```

> Primeiro build precisa rodar `gradle wrapper` se o `gradlew` ainda não existe.

## Wallpaper

O launcher procura nessa ordem:
- `/sdcard/three_wallpaper.png`
- `/sdcard/three_wallpaper.jpg`
- `/sdcard/Download/three_wallpaper.png`
- `/sdcard/Download/three_wallpaper.jpg`

Se nenhum existir, mostra gradient roxo default.

Use **uma imagem por orientação** (a mesma TV roda só retrato OU paisagem):
- TV retrato: imagem 1080×1920 (ou 720×1280)
- TV paisagem: imagem 1920×1080 (ou 1280×720)

O script de provisionamento sobe o arquivo certo conforme a orientação.

## Instalação manual (sem provisionamento)

```bash
adb install -r app-release.apk
adb shell cmd package set-home-activity com.threedigital.launcher/.MainActivity
adb push minha-foto.png /sdcard/three_wallpaper.png
adb reboot
```

## Permissões necessárias

- `ACCESS_WIFI_STATE` + `ACCESS_FINE_LOCATION`: pra mostrar o SSID Wi-Fi (Android 8+ exige location)
- `REBOOT`: pra botão reiniciar (só funciona com root ou app system)
- `QUERY_ALL_PACKAGES`: pra encontrar Xibo/RustDesk instalados

Em tv-boxes Rockchip com root (o caso da Three Digital), todas funcionam.
Sem root, o botão Reiniciar pede confirmação e tenta via `su -c reboot`.

## Estrutura

```
launcher-tv/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/threedigital/launcher/MainActivity.kt
│       └── res/
│           ├── drawable/
│           ├── layout/activity_main.xml
│           ├── mipmap-anydpi-v26/ic_launcher.xml
│           └── values/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Atalhos pra suporte

Se ficar travado/sem botão sair, conecta via ADB ou RustDesk e:
```bash
# Voltar pro launcher OEM temporariamente
adb shell cmd package set-home-activity com.android.launcher3/.Launcher
# Ou desativar Three Launcher de vez
adb shell pm disable-user --user 0 com.threedigital.launcher
```
