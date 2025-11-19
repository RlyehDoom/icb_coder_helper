# Dockerfile para Grafo Query Service
FROM python:3.11-slim

# Establecer directorio de trabajo
WORKDIR /app

# Copiar requirements
COPY requirements.txt .

# Instalar dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY src/ ./src/

# Exponer puertos (por defecto 9081, configurable vía ENV)
EXPOSE 9081

# Variables de entorno por defecto
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=9081
ENV PYTHONUNBUFFERED=1

# Comando de inicio - usa shell form para expandir variables de entorno
CMD python -m uvicorn src.server:app --host ${SERVER_HOST} --port ${SERVER_PORT}

