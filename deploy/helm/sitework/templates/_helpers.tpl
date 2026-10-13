{{/*
Chart name, truncated to the 63-character DNS label limit.
*/}}
{{- define "sitework.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name. A release named after the chart (the usual `sitework`) is not
doubled up, so objects are `sitework-api`, `sitework-web`, `sitework-db`, ...
*/}}
{{- define "sitework.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sitework.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels. Call with (dict "root" $ "component" "api").
*/}}
{{- define "sitework.labels" -}}
helm.sh/chart: {{ include "sitework.chart" .root }}
{{ include "sitework.selectorLabels" . }}
app.kubernetes.io/version: {{ include "sitework.imageTag" .root | trunc 63 | trimSuffix "-" | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
app.kubernetes.io/part-of: sitework
{{- end }}

{{/*
Selector labels (immutable on Deployments, so never add to these).
*/}}
{{- define "sitework.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sitework.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- with .component }}
app.kubernetes.io/component: {{ . }}
{{- end }}
{{- end }}

{{- define "sitework.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag | toString }}
{{- end }}

{{/*
Image reference. Call with (dict "root" $ "repository" .Values.api.image.repository).
registry "" uses the repository as-is (kind, local Docker); otherwise registry/repository:tag.
*/}}
{{- define "sitework.image" -}}
{{- $registry := trimSuffix "/" .root.Values.image.registry }}
{{- $tag := include "sitework.imageTag" .root }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry .repository $tag }}
{{- else }}
{{- printf "%s:%s" .repository $tag }}
{{- end }}
{{- end }}

{{- define "sitework.api.fullname" -}}
{{- printf "%s-api" (include "sitework.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sitework.web.fullname" -}}
{{- printf "%s-web" (include "sitework.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sitework.migrations.fullname" -}}
{{- printf "%s-migrations" (include "sitework.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sitework.api.serviceAccountName" -}}
{{- if .Values.api.serviceAccount.create }}
{{- default (include "sitework.api.fullname" .) .Values.api.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.api.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "sitework.web.serviceAccountName" -}}
{{- if .Values.web.serviceAccount.create }}
{{- default (include "sitework.web.fullname" .) .Values.web.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.web.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
In-cluster URL of the API Service (port 80).
*/}}
{{- define "sitework.api.internalUrl" -}}
{{- printf "http://%s.%s.svc.cluster.local" (include "sitework.api.fullname" .) .Release.Namespace }}
{{- end }}

{{/*
Name of the Secret holding the database `username` and `password`:
  - externalSecret.enabled: <fullname>-db, materialised by External Secrets Operator;
  - otherwise database.existingSecret, falling back to <fullname>-db (bring your own).
*/}}
{{- define "sitework.db.secretName" -}}
{{- if .Values.database.externalSecret.enabled }}
{{- if .Values.database.existingSecret }}
{{- fail "database.existingSecret and database.externalSecret.enabled are mutually exclusive: pick one source for the database credentials" }}
{{- end }}
{{- printf "%s-db" (include "sitework.fullname" .) }}
{{- else }}
{{- default (printf "%s-db" (include "sitework.fullname" .)) .Values.database.existingSecret }}
{{- end }}
{{- end }}

{{/*
Database connection env vars, shared by the API Deployment and the migration Job.
*/}}
{{- define "sitework.db.env" -}}
- name: Database__Host
  value: {{ .Values.database.host | quote }}
- name: Database__Port
  value: {{ .Values.database.port | quote }}
- name: Database__Name
  value: {{ .Values.database.name | quote }}
- name: Database__SslMode
  value: {{ .Values.database.sslMode | quote }}
- name: Database__Username
  valueFrom:
    secretKeyRef:
      name: {{ include "sitework.db.secretName" . }}
      key: username
# Read from a mounted file (see sitework.db.volume) and re-read periodically, so a rotated
# RDS password reaches new connections without restarting pods.
- name: Database__PasswordFile
  value: /var/run/secrets/sitework-db/password
{{- end }}

{{/*
The database password as a file. Kubernetes updates mounted Secrets in place when ESO refreshes them.
*/}}
{{- define "sitework.db.volume" -}}
- name: db-credentials
  secret:
    secretName: {{ include "sitework.db.secretName" . }}
    defaultMode: 0440
    items:
      - key: password
        path: password
{{- end }}

{{- define "sitework.db.volumeMount" -}}
- name: db-credentials
  mountPath: /var/run/secrets/sitework-db
  readOnly: true
{{- end }}

{{/*
Everything the API process reads from the environment (Deployment and migration Job alike).
*/}}
{{- define "sitework.api.env" -}}
- name: ASPNETCORE_ENVIRONMENT
  value: {{ .Values.api.environment | quote }}
{{ include "sitework.db.env" . }}
{{- range $i, $cidr := .Values.api.trustedProxyNetworks }}
- name: TrustedProxyNetworks__{{ $i }}
  value: {{ $cidr | quote }}
{{- end }}
{{- with .Values.api.rateLimiting.requestsPerMinute }}
- name: RateLimiting__RequestsPerMinute
  value: {{ . | quote }}
{{- end }}
{{- with .Values.api.rateLimiting.writesPerMinute }}
- name: RateLimiting__WritesPerMinute
  value: {{ . | quote }}
{{- end }}
{{- with (.Values.api.telemetry).otlpEndpoint }}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ . | quote }}
- name: OTEL_EXPORTER_OTLP_PROTOCOL
  value: {{ ($.Values.api.telemetry).otlpProtocol | default "grpc" | quote }}
{{- end }}
{{- with (.Values.api.telemetry).resourceAttributes }}
- name: OTEL_RESOURCE_ATTRIBUTES
  value: {{ . | quote }}
{{- end }}
{{- end }}

{{/*
Zone (and node) spread. ScheduleAnyway: a preference, so a single-AZ or single-node cluster
(kind) still schedules everything. matchLabelKeys scopes the spread to one ReplicaSet revision.
Call with (dict "root" $ "component" "api").
*/}}
{{- define "sitework.topologySpread" -}}
{{- range list "topology.kubernetes.io/zone" "kubernetes.io/hostname" }}
- maxSkew: 1
  topologyKey: {{ . }}
  whenUnsatisfiable: ScheduleAnyway
  labelSelector:
    matchLabels:
      {{- include "sitework.selectorLabels" $ | nindent 6 }}
  matchLabelKeys:
    - pod-template-hash
{{- end }}
{{- end }}
