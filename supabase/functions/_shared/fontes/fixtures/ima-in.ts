// Recorte da página https://in.ima.sc.gov.br/ baixada em 20/11/2026: quatro cards (IN 00, IN 02 com
// um subcard de licença, IN 12 revogada e IN 84), sem os textos longos e sem os anexos. Fica em .ts
// para o teste rodar sem --allow-read, como no CI.

export const PAGINA_DAS_INS = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <title>Instruções Normativas | IMA</title>
</head>
<body>
                <div class="row">
            <div class="col-lg-12">
              <div class="card card-default collapsed-card">
                <div class="bg-lightblue card-header">
                  <h3 class="card-title " data-card-widget="collapse" style="cursor:pointer">IN 00 - DIRETRIZES GERAIS PARA O LICENCIAMENTO AMBIENTAL NO IMA</h3>
                  <h6 class="card-subtitle mb-2 " style="position:absolute; float:left; bottom: 0px; font-size:13px; color:whitesmoke"><b>Criada em: 19/09/2022 | Atualizada em: 04/12/2024</b></h6>
                  <div class="card-tools">
                    <button type="button" class="btn btn-tool" data-card-widget="collapse" style="float: right;color:whitesmoke"><i class="fas fa-plus"></i></button>
                                          <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/331" class="btn btn-tool" style="float: right;color:whitesmoke"> <i class="fas fa-download"></i></a>
                                              <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/331" class="btn btn-tool" style="float: right;color:whitesmoke"> <i class="fas fa-eye"></i></a>
                  </div>
                </div>
                <div class="card-footer bg-navy">
                  <div class="row">
                    <div class="col-lg-12">
                      <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/historico/00" class="btn btn-outline-primary " style="float: right;"><i class="fas fa-file-pdf"></i> VER HISTÓRICO</a>
                      <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/331" class="btn btn-outline-warning " style="float: right;"><i class="fas fa-file-pdf"></i> DOWNLOAD</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
                <div class="row">
            <div class="col-lg-12">
              <div class="card card-default collapsed-card">
                <div class="bg-lightblue card-header">
                  <h3 class="card-title " data-card-widget="collapse" style="cursor:pointer">IN 02 - DISPOSIÇÃO FINAL DE REJEITOS EM ATERROS</h3>
                  <h6 class="card-subtitle mb-2 " style="position:absolute; float:left; bottom: 0px; font-size:13px; color:whitesmoke"><b>Criada em: 28/07/2011 | Atualizada em: 10/10/2025</b></h6>
                  <div class="card-tools">
                    <button type="button" class="btn btn-tool" data-card-widget="collapse" style="float: right;color:whitesmoke"><i class="fas fa-plus"></i></button>
                                          <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/344" class="btn btn-tool" style="float: right;color:whitesmoke"> <i class="fas fa-download"></i></a>
                                              <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/visualizar/344" class="btn btn-tool" style="float: right;color:whitesmoke"> <i class="fas fa-eye"></i></a>
                  </div>
                </div>
                <div class="card-body">
                                          <div class="row">
                        <div class="col-lg-12">
                          <div class="card card-default collapsed-card">
                            <div class="card-header bg-light">
                              <h3 class="card-title " style="cursor:pointer" data-card-widget="collapse">Licenciamento Ambiental Prévio (LAP)</h3>
                            </div>
                          </div>
                        </div>
                      </div>
                </div>
              </div>
            </div>
          </div>
                <div class="row">
            <div class="col-lg-12">
              <div class="card card-default collapsed-card">
                <div class="bg-danger card-header">
                  <h3 class="card-title " data-card-widget="collapse" style="cursor:pointer">IN 12 - ORIZICULTURA (REVOGADA)</h3>
                  <h6 class="card-subtitle mb-2 " style="position:absolute; float:left; bottom: 0px; font-size:13px; color:whitesmoke"><b>Criada em: 21/02/2009 | Atualizada em: 21/02/2009</b></h6>
                  <div class="card-tools">
                    <button type="button" class="btn btn-tool" data-card-widget="collapse" style="float: right;color:whitesmoke"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
                <div class="card-footer bg-navy">
                  <div class="row">
                    <div class="col-lg-12">
                      <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/historico/12" class="btn btn-outline-primary " style="float: right;"><i class="fas fa-file-pdf"></i> VER HISTÓRICO</a>
                      <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/340" class="btn btn-outline-warning " style="float: right;"><i class="fas fa-file-pdf"></i> DOWNLOAD</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
                <div class="row">
            <div class="col-lg-12">
              <div class="card card-default collapsed-card">
                <div class="bg-lightblue card-header">
                  <h3 class="card-title " data-card-widget="collapse" style="cursor:pointer">IN 84 - COMPENSAÇÃO DE RESERVA LEGAL</h3>
                  <h6 class="card-subtitle mb-2 " style="position:absolute; float:left; bottom: 0px; font-size:13px; color:whitesmoke"><b>Criada em: 22/05/2024 | Atualizada em: 20/08/2024</b></h6>
                  <div class="card-tools">
                    <button type="button" class="btn btn-tool" data-card-widget="collapse" style="float: right;color:whitesmoke"><i class="fas fa-plus"></i></button>
                                          <a type="button" target="_blank" href="https://in.ima.sc.gov.br/instrucaoNormativa/downloadPDF/328" class="btn btn-tool" style="float: right;color:whitesmoke"> <i class="fas fa-download"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
</body>
</html>
`
