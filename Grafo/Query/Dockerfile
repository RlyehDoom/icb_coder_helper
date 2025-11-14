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

# Exponer puerto
EXPOSE 8081

# Variables de entorno por defecto
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8081
ENV PYTHONUNBUFFERED=1

# Comando de inicio
CMD ["python", "-m", "uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8081"]

