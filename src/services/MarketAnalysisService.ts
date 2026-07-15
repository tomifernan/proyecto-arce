import { Portfolio, RiskAnalysis } from "../models/types";
import { storage } from "../utils/storage";

/**
 * ============================================================================
 * SUBSISTEMA 1: Analizador de Riesgo (RiskAnalyzer)
 * Calcula la diversificación sectorial, la volatilidad ponderada del portafolio
 * y determina el nivel de riesgo con sus respectivas recomendaciones.
 * ============================================================================
 */
class RiskAnalyzer {
  /**
   * Realiza el análisis completo de riesgo de la cartera de un usuario.
   */
  analyze(portfolio: Portfolio, userId: string): RiskAnalysis {
    // 1. Calcular el puntaje de diversificación (0 a 100)
    const diversificationScore = this.calculateDiversification(portfolio);
    
    // 2. Calcular el puntaje de volatilidad general (0 a 100)
    const volatilityScore = this.calculateVolatility(portfolio);

    // 3. Matriz de decisión para determinar el nivel de riesgo final (low | medium | high)
    let riskLevel: "low" | "medium" | "high";
    if (volatilityScore < 30 && diversificationScore > 70) {
      riskLevel = "low"; // Baja volatilidad y alta diversificación
    } else if (volatilityScore < 60 && diversificationScore > 40) {
      riskLevel = "medium"; // Valores moderados
    } else {
      riskLevel = "high"; // Alta volatilidad o portafolio muy concentrado
    }

    // 4. Generar consejos accionables basados en las métricas obtenidas
    const recommendations = this.generateRecommendations(
      diversificationScore,
      volatilityScore,
      riskLevel
    );

    // 5. Crear la entidad de análisis de riesgo y guardar los resultados
    const analysis = new RiskAnalysis(userId);
    analysis.updateRisk(riskLevel, diversificationScore, recommendations);

    return analysis;
  }

  /**
   * Calcula qué tan diversificado está el portafolio (0 = Nada diversificado, 100 = Excelente).
   * Evalúa la cantidad de sectores diferentes y penaliza la alta concentración en un solo activo.
   */
  private calculateDiversification(portfolio: Portfolio): number {
    if (portfolio.holdings.length === 0) return 0;

    // A. Contar cuántos sectores únicos tiene el portafolio
    const sectors = new Set<string>();
    portfolio.holdings.forEach((holding) => {
      const asset = storage.getAssetBySymbol(holding.symbol);
      if (asset) sectors.add(asset.sector);
    });

    const sectorCount = sectors.size;
    const maxSectors = 5; // Umbral óptimo para máxima puntuación de sectores
    
    // El puntaje por sectores aporta hasta 50 puntos (proporcional al máximo de 5 sectores)
    const sectorScore = Math.min(sectorCount / maxSectors, 1) * 50;

    // B. Penalización por Concentración (Evitar tener "todos los huevos en una sola canasta")
    const totalValue = portfolio.totalValue;
    let concentrationPenalty = 0;

    portfolio.holdings.forEach((holding) => {
      // Porcentaje de peso que representa este activo en el portafolio total
      const weight = holding.currentValue / totalValue;
      
      // Si un solo activo representa más del 30% de la cartera, se aplica penalización
      if (weight > 0.3) {
        concentrationPenalty += (weight - 0.3) * 100;
      }
    });

    // La distribución aporta los otros 50 puntos del total, menos la penalización aplicada
    const distributionScore = Math.max(50 - concentrationPenalty, 0);
    
    // Retorna la suma de ambos puntajes (Sectores + Distribución), topado en 100
    return Math.min(sectorScore + distributionScore, 100);
  }

  /**
   * Calcula la volatilidad del portafolio usando la volatilidad ponderada de cada holding.
   */
  private calculateVolatility(portfolio: Portfolio): number {
    if (portfolio.holdings.length === 0) return 0;

    let weightedVolatility = 0;
    const totalValue = portfolio.totalValue;

    // Suma la volatilidad de cada activo multiplicada por su peso porcentual en el portafolio
    portfolio.holdings.forEach((holding) => {
      const weight = holding.currentValue / totalValue;
      weightedVolatility += weight * this.getAssetVolatility(holding.symbol);
    });

    return Math.min(weightedVolatility, 100);
  }

  /**
   * Devuelve un porcentaje estimado de volatilidad según el sector del activo.
   */
  private getAssetVolatility(symbol: string): number {
    const asset = storage.getAssetBySymbol(symbol);
    if (!asset) return 50; // Volatilidad por defecto

    // Mapeo estático de volatilidad promedio por sectores industriales
    const volatilityBySector: { [key: string]: number } = {
      Technology: 65,
      Healthcare: 45,
      Financial: 55,
      Automotive: 70,
      "E-commerce": 60,
    };

    return volatilityBySector[asset.sector] || 50;
  }

  /**
   * Analiza los puntajes y redacta sugerencias personalizadas para el inversor.
   */
  private generateRecommendations(
    diversification: number,
    volatility: number,
    riskLevel: "low" | "medium" | "high"
  ): string[] {
    const recommendations: string[] = [];

    if (diversification < 40)
      recommendations.push("Considera diversificar en más sectores");
    if (volatility > 70)
      recommendations.push("Reduce activos volátiles, agrega más estables");
    if (riskLevel === "high")
      recommendations.push("Riesgo alto detectado, revisa tu estrategia");
    if (diversification > 80 && volatility < 30)
      recommendations.push("Excelente diversificación y bajo riesgo, sigue así");

    // Si todo marcha perfecto y no hay alertas críticas
    if (recommendations.length === 0)
      recommendations.push("Cartera equilibrada, seguir monitoreando");

    return recommendations;
  }
}

/**
 * ============================================================================
 * SUBSISTEMA 2: Analizador Técnico (TechnicalAnalyzer)
 * Calcula indicadores clave (SMA, RSI) para generar señales de Trading.
 * ============================================================================
 */
class TechnicalAnalyzer {
  /**
   * Ejecuta un análisis técnico simplificado sobre un activo financiero.
   */
  analyze(symbol: string) {
    const marketData = storage.getMarketDataBySymbol(symbol);
    if (!marketData) throw new Error("Datos de mercado no encontrados");

    // Cálculo simulado de medias móviles simples (20 y 50 periodos) y el RSI
    const sma20 = this.calculateSMA(marketData.price);
    const sma50 = this.calculateSMA(marketData.price);
    const rsi = this.calculateRSI();

    // Lógica para determinar la señal del mercado (Comprar, Vender o Mantener)
    let signal: "buy" | "sell" | "hold" = "hold";
    
    // Estrategia de Cruce de Medias + RSI:
    // Compra: El precio actual supera la SMA20, la de 20 supera a la de 50 y no está sobrecomprado (RSI < 70)
    if (marketData.price > sma20 && sma20 > sma50 && rsi < 70) {
      signal = "buy";
    } 
    // Venta: El precio cae bajo la SMA20, la de 20 cae bajo la de 50 y no está sobrevendido (RSI > 30)
    else if (marketData.price < sma20 && sma20 < sma50 && rsi > 30) {
      signal = "sell";
    }

    return {
      symbol,
      currentPrice: marketData.price,
      sma20,
      sma50,
      rsi,
      signal,
      timestamp: new Date(),
    };
  }

  /**
   * Simula el cálculo de la Media Móvil Simple aplicando una desviación aleatoria al precio.
   */
  private calculateSMA(price: number): number {
    const variation = (Math.random() - 0.5) * 0.1; // Desviación de -5% a +5%
    return price * (1 + variation);
  }

  /**
   * Simula el oscilador RSI (Relative Strength Index) en su rango normal de operación (20 a 80).
   */
  private calculateRSI(): number {
    return 20 + Math.random() * 60;
  }
}

/**
 * ============================================================================
 * SUBSISTEMA 3: Analizador de Recomendaciones (RecommendationAnalyzer)
 * Filtra activos que el usuario aún no posee y le sugiere oportunidades de inversión
 * alineadas perfectamente con su tolerancia al riesgo.
 * ============================================================================
 */
class RecommendationAnalyzer {
  /**
   * Genera hasta 5 recomendaciones de activos óptimos para un usuario específico.
   */
  generate(userId: string) {
    const user = storage.getUserById(userId);
    const portfolio = storage.getPortfolioByUserId(userId);
    if (!user || !portfolio) throw new Error("Usuario o cartera no encontrados");

    const recommendations: any[] = [];
    const allAssets = storage.getAllAssets();

    allAssets.forEach((asset) => {
      // 1. Filtrar: No recomendar activos que el usuario ya tenga en su portafolio
      const hasHolding = portfolio.holdings.some((h) => h.symbol === asset.symbol);
      if (hasHolding) return;

      let text = "";
      let priority = 0;
      const volatility = Math.random() * 100; // Genera volatilidad aleatoria para evaluar el asset

      // 2. Lógica de Matching (Emparejar tolerancia de riesgo con volatilidad del activo)
      if (user.riskTolerance === "low" && volatility < 50) {
        text = "Activo de bajo riesgo recomendado para perfil conservador";
        priority = 1; // Prioridad estándar
      } else if (user.riskTolerance === "high" && volatility > 60) {
        text = "Activo de alto crecimiento para perfil agresivo";
        priority = 2; // Alta prioridad por alto potencial de ganancias
      } else if (user.riskTolerance === "medium") {
        text = "Activo balanceado recomendado para perfil moderado";
        priority = 1;
      }

      // 3. Si el activo calza con el perfil del usuario, se guarda la recomendación
      if (text) {
        recommendations.push({
          symbol: asset.symbol,
          name: asset.name,
          currentPrice: asset.currentPrice,
          recommendation: text,
          priority,
          riskLevel: volatility > 60 ? "high" : "medium",
        });
      }
    });

    // 4. Ordenar las recomendaciones por prioridad descendente y retornar el Top 5
    return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }
}

/**
 * ============================================================================
 * CLASE FACHADA (Facade Pattern): MarketAnalysisService
 * Proporciona una interfaz simple de alto nivel delegando el trabajo sucio
 * a los tres analizadores especializados anteriores.
 * ============================================================================
 */
export class MarketAnalysisService {
  private riskAnalyzer = new RiskAnalyzer();
  private technicalAnalyzer = new TechnicalAnalyzer();
  private recommendationAnalyzer = new RecommendationAnalyzer();

  /**
   * API Simplificada para el análisis de riesgo del portafolio.
   */
  analyzeRisk(userId: string) {
    const portfolio = storage.getPortfolioByUserId(userId);
    if (!portfolio) throw new Error("Cartera no encontrada");
    return this.riskAnalyzer.analyze(portfolio, userId);
  }

  /**
   * API Simplificada para realizar análisis técnico de un símbolo de mercado.
   */
  analyzeTechnical(symbol: string) {
    return this.technicalAnalyzer.analyze(symbol);
  }

  /**
   * API Simplificada para obtener las mejores recomendaciones personalizadas de inversión.
   */
  generateRecommendations(userId: string) {
    return this.recommendationAnalyzer.generate(userId);
  }
}