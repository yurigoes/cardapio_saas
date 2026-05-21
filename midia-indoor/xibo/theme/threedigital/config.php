<?php
/**
 * Tema customizado — Three Digital Mídia
 *
 * Instalação: este diretório vai pra /var/www/cms/web/theme/custom/threedigital
 * no container do Xibo (volume xibo_web). Depois selecione "Three Digital"
 * em Configurações → Tema.
 *
 * Troque os logos em img/ pelos seus (mesmos nomes de arquivo).
 */
$config = [
    // Validação client-side dos forms
    "client_side_validation" => true,

    // Nomes / títulos (aparecem na aba do browser, login, topo)
    "theme_title"  => "Three Digital Mídia",
    "app_name"     => "Three Digital Mídia",
    "cms_title"    => "Three Digital Mídia",

    // Logos (caminhos relativos à raiz web do Xibo)
    "theme_logo"        => "theme/custom/threedigital/img/logo.png",
    "theme_logo_small"  => "theme/custom/threedigital/img/logo-small.png",

    // Mensagem na tela de login
    "login_message" => "Painel de Mídia Indoor",

    // Prefixo de cookie (evita conflito se rodar outro Xibo no mesmo domínio)
    "cookie_prefix" => "tdm",

    // Links do rodapé / suporte
    "support_url"   => "https://tthreedigital.com.br",
    "help_base"     => "https://tthreedigital.com.br/",

    // AGPL: o Xibo é AGPLv3 — manter link pro código-fonte é a forma
    // correta de cumprir a licença sem precisar publicar nada próprio.
    "source_url"    => "https://github.com/xibosignage/xibo",

    // Esconde widget de "últimas notícias" do Xibo
    "latest_news_url" => "",
    "dashboard_url"   => "",
];
