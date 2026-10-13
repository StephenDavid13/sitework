# syntax=docker/dockerfile:1.7
# Build context: apps/api. Cross-compiles on the build host's architecture for speed.

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG TARGETARCH
WORKDIR /src

COPY Directory.Build.props ./
COPY src/Sitework.Api/Sitework.Api.csproj src/Sitework.Api/
RUN dotnet restore src/Sitework.Api/Sitework.Api.csproj -a $TARGETARCH

COPY src/Sitework.Api/ src/Sitework.Api/
RUN dotnet publish src/Sitework.Api/Sitework.Api.csproj \
      -c Release -a $TARGETARCH --no-restore -o /app \
      -p:OpenApiGenerateDocuments=false -p:UseAppHost=false

# Chiseled: no shell or package manager, runs as the non-root "app" user.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
# Pass --migrate (or --reset-demo-data) to run a one-shot database command instead of the server.
ENTRYPOINT ["dotnet", "Sitework.Api.dll"]
