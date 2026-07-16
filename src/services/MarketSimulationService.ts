// Servicio de simulación de mercado refactorizado con Template Method
import { storage } from "../utils/storage";
import { config } from "../config/config";

/**
 * ============================================================================
 * PATRÓN TEMPLATE METHOD: cree clase base, luego hice 3 clases que la heredan (RandomMarketSimulation,
 * BullMarketSimulation, BearMarketSimulation), cada una cambia en que forma se actualizan los precios.
 * ============================================================================
 */
abstract class MarketSimulationTemplate {
  
  /**
   * EL TEMPLATE METHOD (Método Plantilla)
   * Define el flujo de ejecución completo e inalterable para actualizar el mercado.
   */
  updatePrices(): void {
    // 1. Obtener todos los activos financieros del almacenamiento
    const allMarketData = storage.getAllMarketData();

    allMarketData.forEach((marketData) => {
      // Pasos del algoritmo:
      // a. Calcular el nuevo precio (Este paso varía según el tipo de simulación)
      const newPrice = this.calculateNewPrice(marketData.price);
      
      // b. Calcular la variación absoluta y porcentual del precio
      const change = newPrice - marketData.price;
      const changePercent = (change / marketData.price) * 100;

      // c. Actualizar los registros en la base de datos de datos en tiempo real
      marketData.price = newPrice;
      marketData.change = change;
      marketData.changePercent = changePercent;
      marketData.timestamp = new Date();
      storage.updateMarketData(marketData);

      // d. Sincronizar el nuevo precio en el Asset (activo base) correspondiente
      const asset = storage.getAssetBySymbol(marketData.symbol);
      if (asset) {
        asset.currentPrice = newPrice;
        asset.lastUpdated = new Date();
        storage.updateAsset(asset);
      }
    });

    // 2. Al finalizar la actualización de precios, recalcular el valor de todos los portafolios
    this.updateAllPortfolioValues();
  }

  /**
   * OPERACIÓN PRIMITIVA (Paso abstracto)
   * Cada tipo de mercado (Bull, Bear, Crash...) debe implementar su propia fórmula aquí.
   */
  protected abstract calculateNewPrice(currentPrice: number): number;

  /**
   * Método auxiliar para iterar y actualizar el portafolio de usuarios clave del sistema.
   */
  private updateAllPortfolioValues(): void {
    // Se filtran únicamente los usuarios que existan actualmente en el storage
    const allUsers = [
      storage.getUserById("demo_user"),
      storage.getUserById("admin_user"),
      storage.getUserById("trader_user"),
    ].filter((user) => user !== undefined);

    allUsers.forEach((user) => {
      if (user) {
        const portfolio = storage.getPortfolioByUserId(user.id);
        // Si el portafolio existe y tiene activos, recalculamos sus valores totales
        if (portfolio && portfolio.holdings.length > 0) {
          this.recalculatePortfolioValues(portfolio);
          storage.updatePortfolio(portfolio); // Guardar cambios persistentes
        }
      }
    });
  }

  /**
   * Recalcula el valor actual de cada holding (activo en posesión) de un portafolio,
   * así como el rendimiento (retorno de inversión) absoluto y porcentual del mismo.
   */
  private recalculatePortfolioValues(portfolio: any): void {
    let totalValue = 0;
    let totalInvested = 0;

    portfolio.holdings.forEach((holding: any) => {
      const asset = storage.getAssetBySymbol(holding.symbol);
      if (asset) {
        // Valor actual de la posición = cantidad poseída * precio actual de mercado
        holding.currentValue = holding.quantity * asset.currentPrice;
        
        // Total invertido inicialmente = cantidad * precio promedio de compra
        const invested = holding.quantity * holding.averagePrice;
        
        // Retorno total en dinero (ganancia/pérdida)
        holding.totalReturn = holding.currentValue - invested;
        
        // Retorno porcentual de este activo
        holding.percentageReturn =
          invested > 0 ? (holding.totalReturn / invested) * 100 : 0;

        // Sumar al total general del portafolio
        totalValue += holding.currentValue;
        totalInvested += invested;
      }
    });

    // Actualización de las métricas globales del portafolio
    portfolio.totalValue = totalValue;
    portfolio.totalInvested = totalInvested;
    portfolio.totalReturn = totalValue - totalInvested;
    portfolio.percentageReturn =
      totalInvested > 0 ? (portfolio.totalReturn / totalInvested) * 100 : 0;
    portfolio.lastUpdated = new Date();
  }
}


/**
 * ============================================================================
 * IMPLEMENTACIONES CONCRETAS DEL TEMPLATE METHOD
 * Cada clase define cómo se comporta el mercado bajo diferentes escenarios.
 * ============================================================================
 */

/**
 * Mercado Lateral / Aleatorio:
 * Flutúa de manera impredecible hacia arriba o hacia abajo aplicando volatilidad configurada.
 */
class RandomMarketSimulation extends MarketSimulationTemplate {
  protected calculateNewPrice(currentPrice: number): number {
    const randomChange = (Math.random() - 0.5) * 2; // Rango de -1 a +1
    const volatilityFactor = config.market.volatilityFactor; // Factor de riesgo
    const priceChange = currentPrice * randomChange * volatilityFactor;
    // Retorna el precio modificado, asegurando un piso mínimo de 0.01 para no quebrar el activo
    return Math.max(currentPrice + priceChange, 0.01);
  }
}

/**
 * Mercado Alcista (Bull Market):
 * Simula un crecimiento positivo fuerte de entre un +5% y un +15%.
 */
class BullMarketSimulation extends MarketSimulationTemplate {
  protected calculateNewPrice(currentPrice: number): number {
    const impactFactor = 0.05 + Math.random() * 0.1; // +5% a +15%
    return Math.max(currentPrice * (1 + impactFactor), 0.01);
  }
}

/**
 * Mercado Bajista (Bear Market):
 * Simula pérdidas controladas de entre un -5% y un -15%.
 */
class BearMarketSimulation extends MarketSimulationTemplate {
  protected calculateNewPrice(currentPrice: number): number {
    const impactFactor = -(0.05 + Math.random() * 0.1); // -5% a -15%
    return Math.max(currentPrice * (1 + impactFactor), 0.01);
  }
}

/**
 * Colapso de Mercado (Crash Market):
 * Simula pánico financiero masivo, desplomando los precios entre un -15% y un -35%.
 */
class CrashMarketSimulation extends MarketSimulationTemplate {
  protected calculateNewPrice(currentPrice: number): number {
    const impactFactor = -(0.15 + Math.random() * 0.2); // -15% a -35%
    return Math.max(currentPrice * (1 + impactFactor), 0.01);
  }
}

/**
 * Recuperación de Mercado (Recovery Market):
 * Simula un rebote alcista rápido con incrementos de entre un +10% y un +25%.
 */
class RecoveryMarketSimulation extends MarketSimulationTemplate {
  protected calculateNewPrice(currentPrice: number): number {
    const impactFactor = 0.1 + Math.random() * 0.15; // +10% a +25%
    return Math.max(currentPrice * (1 + impactFactor), 0.01);
  }
}


/**
 * ============================================================================
 * SERVICIO COORDINADOR (MarketSimulationService)
 * Controla los ciclos de actualización del mercado (Start, Stop, Events)
 * ============================================================================
 */
export class MarketSimulationService {
  private isRunning: boolean = false;               // Bandera de estado del bucle
  private intervalId: NodeJS.Timeout | null = null; // ID del intervalo para poder frenarlo
  private simulation: MarketSimulationTemplate | null = null; // Estrategia de simulación activa


  /**
   * Inicia la simulación automática y repetitiva usando un intervalo de tiempo configurable.
   */
  startMarketSimulation(): void {
    if (this.isRunning) {
      console.log("La simulación de mercado ya está ejecutándose");
      return;
    }

    this.isRunning = true;
    console.log("Iniciando simulación de mercado...");
    
    // Por defecto, se inicia con un comportamiento de fluctuación aleatoria/orgánica
    this.simulation = new RandomMarketSimulation();

    // Configura el ciclo recurrente usando el intervalo definido en la configuración global
    this.intervalId = setInterval(() => {
      this.simulation!.updatePrices();
    }, config.market.updateIntervalMs);
  }

  /**
   * Detiene por completo la simulación y limpia el intervalo del sistema.
   */
  stopMarketSimulation(): void {
    if (!this.isRunning) {
      console.log("La simulación de mercado no está ejecutándose");
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId); // Frena las ejecuciones repetitivas
      this.intervalId = null;
    }
    console.log("Simulación de mercado detenida");
  }

  /**
   * Fuerza un evento de mercado inmediato (Crashes, Alzas, etc.) 
   * instanciando temporalmente una de las clases concretas.
   */
  simulateMarketEvent(eventType: "bull" | "bear" | "crash" | "recovery"): void {
    console.log(`Simulando evento de mercado: ${eventType}`);

    // Instancia dinámicamente la clase correspondiente al evento
    switch (eventType) {
      case "bull":
        this.simulation = new BullMarketSimulation();
        break;
      case "bear":
        this.simulation = new BearMarketSimulation();
        break;
      case "crash":
        this.simulation = new CrashMarketSimulation();
        break;
      case "recovery":
        this.simulation = new RecoveryMarketSimulation();
        break;
    }

    // Ejecuta de inmediato una iteración bajo la nueva estrategia
    this.simulation.updatePrices();
  }

  /**
   * Retorna el estado actual de la simulación del sistema.
   */
  getSimulationStatus(): { isRunning: boolean; lastUpdate: Date | null } {
    return {
      isRunning: this.isRunning,
      lastUpdate: this.isRunning ? new Date() : null,
    };
  }
}