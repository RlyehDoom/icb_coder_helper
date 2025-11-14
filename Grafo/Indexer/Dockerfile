# Multi-stage build for optimized CLI tool
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

# Copy project file and restore dependencies
COPY RoslynIndexer.csproj .
RUN dotnet restore

# Copy source code
COPY src/ ./src/

# Build and publish the application
RUN dotnet publish -c Release -o out --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime
WORKDIR /app

# Install dependencies for file processing
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy published application
COPY --from=build /app/out .

# Create directories for input/output
RUN mkdir -p /input /output /config

# Create entry script
RUN echo '#!/bin/bash\n\
if [ "$#" -eq 0 ]; then\n\
    echo "RoslynIndexer - C# Code Analysis Tool"\n\
    echo "Usage: docker run -v /path/to/code:/input -v /path/to/output:/output roslyn-indexer [options]"\n\
    echo ""\n\
    echo "Examples:"\n\
    echo "  # Analyze solution"\n\
    echo "  docker run -v \$PWD:/input -v \$PWD/output:/output roslyn-indexer -s /input/solution.sln -o /output/result.json"\n\
    echo "  "\n\
    echo "  # Generate graph"\n\
    echo "  docker run -v \$PWD:/input -v \$PWD/output:/output roslyn-indexer -s /input/solution.sln -o /output/result.json -g /output/graph.json"\n\
    echo "  "\n\
    echo "  # Batch processing"\n\
    echo "  docker run -v \$PWD:/input -v \$PWD/output:/output -v \$PWD/config:/config roslyn-indexer --batch-config /config/batch.yaml"\n\
    dotnet RoslynIndexer.dll --help\n\
else\n\
    dotnet RoslynIndexer.dll "$@"\n\
fi' > /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
