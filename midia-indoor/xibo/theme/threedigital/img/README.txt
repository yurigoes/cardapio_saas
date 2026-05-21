Coloque aqui os logos da Three Digital:

  logo.png        — logo principal (login + topo). Recomendado: PNG transparente,
                    ~200x60px ou proporção parecida, fundo transparente.
  logo-small.png  — logo reduzida (sidebar recolhida). ~50x50px.

Você já tem logos no MinIO. Pra baixar pra esta pasta direto na VPS:

  cd /var/lib/docker/volumes/xibo_xibo_web/_data/threedigital/img
  # ajuste a URL do seu logo:
  curl -fsSL "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png" -o logo.png
  curl -fsSL "https://minio.tthreedigital.com.br/cardapio/saas/LOGO%20BRANCA%20THREE.png" -o logo-small.png

Depois recarregue o painel Xibo (Ctrl+F5).
