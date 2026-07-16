import { Transaction, Portfolio } from "../models/types";
import { storage } from "../utils/storage";
import { config } from "../config/config";

/**
 * ============================================================================
 * PATRÓN STRATEGY: Elimina los condicionales y centra la logica en las clases.
 * ============================================================================
 */
interface OrderStrategy {
  /**
   * Ejecuta la orden de compra o venta de un activo.
   * @param userId ID del usuario que opera.
   * @param symbol Símbolo del activo (ej. "BTC", "AAPL").
   * @param quantity Cantidad de activos a operar.
   */
  execute(userId: string, symbol: string, quantity: number): Promise<Transaction>;
}

/**
 * ESTRATEGIA DE COMPRA (BuyOrderStrategy)
 * Implementa la lógica para validar fondos, calcular comisiones,
 * descontar saldo, añadir activos al portafolio y simular impacto en el precio.
 */
class BuyOrderStrategy implements OrderStrategy {
  async execute(userId: string, symbol: string, quantity: number): Promise<Transaction> {
    // 1. Validar que el usuario exista en la base de datos/almacenamiento
    const user = storage.getUserById(userId);
    if (!user) throw new Error("Usuario no encontrado");

    // 2. Validar que el activo (asset) exista y esté disponible para operar
    const asset = storage.getAssetBySymbol(symbol);
    if (!asset) throw new Error("Activo no encontrado");

    // 3. Cálculos financieros de la compra
    const executionPrice = asset.currentPrice; // Precio actual de mercado
    const grossAmount = quantity * executionPrice; // Costo bruto (sin comisiones)
    const fees = this.calculateFees(grossAmount); // Comisión calculada
    const totalCost = grossAmount + fees; // Costo total que el usuario debe pagar

    // 4. Verificar si el usuario tiene saldo suficiente
    if (!user.canAfford(totalCost)) throw new Error("Fondos insuficientes");

    // 5. Crear el registro de la transacción con estado inicial
    const transactionId = this.generateTransactionId();
    const transaction = new Transaction(
      transactionId,
      userId,
      "buy",
      symbol,
      quantity,
      executionPrice,
      fees
    );

    // 6. Marcar la transacción como completada
    transaction.complete();

    // 7. Actualizar el saldo del usuario (restar el costo total) y persistir en storage
    user.deductBalance(totalCost);
    storage.updateUser(user);

    // 8. Actualizar el portafolio del usuario agregando el activo comprado
    const portfolio = storage.getPortfolioByUserId(userId);
    if (portfolio) {
      portfolio.addHolding(symbol, quantity, executionPrice); // Agrega o incrementa la posición
      portfolio.calculateTotals(); // Recalcula totales de balance y rendimiento
      storage.updatePortfolio(portfolio); // Guarda cambios del portafolio
    }

    // 9. Guardar el registro de la transacción en el historial
    storage.addTransaction(transaction);

    // 10. Simular el impacto que causa esta compra masiva en el precio de mercado
    this.simulateMarketImpact(symbol, quantity, "buy");

    return transaction;
  }

  /**
   * Calcula la comisión de compra basándose en la configuración del sistema.
   * Aplica un porcentaje o una comisión mínima (la que sea mayor).
   */
  private calculateFees(amount: number): number {
    const fee = amount * config.tradingFees.buyFeePercentage;
    return Math.max(fee, config.tradingFees.minimumFee);
  }

  /**
   * Genera un ID único para la transacción usando un prefijo, timestamp y aleatorio.
   */
  private generateTransactionId(): string {
    return "txn_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Simula el impacto del mercado (Ley de Oferta y Demanda):
   * Comprar un activo incrementa su demanda, lo que hace subir su precio.
   */
  private simulateMarketImpact(symbol: string, quantity: number, action: "buy" | "sell") {
    const marketData = storage.getMarketDataBySymbol(symbol);
    if (!marketData) return;

    // Calcula el factor de impacto según el volumen operado (sobre una base de 1M de unidades)
    const impactFactor = quantity / 1000000;
    const priceImpact = marketData.price * impactFactor * 0.001;

    // Si es compra, sube el precio; si es venta, baja el precio
    const newPrice = action === "buy"
      ? marketData.price + priceImpact
      : marketData.price - priceImpact;

    // Actualiza los datos en tiempo real de mercado
    marketData.price = newPrice;
    marketData.timestamp = new Date();
    storage.updateMarketData(marketData);

    // Sincroniza el nuevo precio directamente en la entidad del Activo
    const asset = storage.getAssetBySymbol(symbol);
    if (asset) {
      asset.currentPrice = newPrice;
      asset.lastUpdated = new Date();
      storage.updateAsset(asset);
    }
  }
}

/**
 * ESTRATEGIA DE VENTA (SellOrderStrategy)
 * Implementa la lógica para validar tenencias del activo en portafolio,
 * calcular la ganancia neta, sumar saldo al usuario y simular el impacto a la baja en el precio.
 */
class SellOrderStrategy implements OrderStrategy {
  async execute(userId: string, symbol: string, quantity: number): Promise<Transaction> {
    // 1. Validar existencia del usuario
    const user = storage.getUserById(userId);
    if (!user) throw new Error("Usuario no encontrado");

    // 2. Validar existencia del activo
    const asset = storage.getAssetBySymbol(symbol);
    if (!asset) throw new Error("Activo no encontrado");

    // 3. Validar existencia del portafolio del usuario
    const portfolio = storage.getPortfolioByUserId(userId);
    if (!portfolio) throw new Error("Portafolio no encontrado");

    // 4. Verificar si el usuario tiene suficientes unidades del activo para vender
    const holding = portfolio.holdings.find((h) => h.symbol === symbol);
    if (!holding || holding.quantity < quantity) {
      throw new Error("No tienes suficientes activos para vender");
    }

    // 5. Cálculos financieros de la venta
    const executionPrice = asset.currentPrice; // Precio de mercado actual
    const grossAmount = quantity * executionPrice; // Ingreso bruto por venta
    const fees = this.calculateFees(grossAmount); // Comisión de venta aplicada
    const netAmount = grossAmount - fees; // Ganancia neta (Monto bruto - Comisiones)

    // 6. Crear el registro de la transacción
    const transactionId = this.generateTransactionId();
    const transaction = new Transaction(
      transactionId,
      userId,
      "sell",
      symbol,
      quantity,
      executionPrice,
      fees
    );

    // 7. Marcar transacción como completada
    transaction.complete();

    // 8. Actualizar el saldo del usuario (añadir la ganancia neta obtenida)
    user.addBalance(netAmount);
    storage.updateUser(user);

    // 9. Restar la cantidad de activos vendidos del portafolio y actualizar
    portfolio.removeHolding(symbol, quantity);
    portfolio.calculateTotals(); // Recalcular métricas generales del portafolio
    storage.updatePortfolio(portfolio);

    // 10. Registrar la transacción en el historial e impactar el mercado
    storage.addTransaction(transaction);
    this.simulateMarketImpact(symbol, quantity, "sell");

    return transaction;
  }

  /**
   * Calcula la comisión de venta aplicando las políticas configuradas.
   */
  private calculateFees(amount: number): number {
    const fee = amount * config.tradingFees.sellFeePercentage;
    return Math.max(fee, config.tradingFees.minimumFee);
  }

  /**
   * Genera un ID único para la transacción.
   */
  private generateTransactionId(): string {
    return "txn_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Simula el impacto de mercado (Vender un activo incrementa su oferta, bajando su precio).
   */
  private simulateMarketImpact(symbol: string, quantity: number, action: "buy" | "sell") {
    const marketData = storage.getMarketDataBySymbol(symbol);
    if (!marketData) return;

    const impactFactor = quantity / 1000000;
    const priceImpact = marketData.price * impactFactor * 0.001;

    const newPrice = action === "buy"
      ? marketData.price + priceImpact
      : marketData.price - priceImpact;

    marketData.price = newPrice;
    marketData.timestamp = new Date();
    storage.updateMarketData(marketData);

    const asset = storage.getAssetBySymbol(symbol);
    if (asset) {
      asset.currentPrice = newPrice;
      asset.lastUpdated = new Date();
      storage.updateAsset(asset);
    }
  }
}

/**
 * ============================================================================
 * PATRÓN FACTORY: Fábrica de Estrategias de Trading
 * Centraliza e instancia la estrategia correcta basándose en el tipo de operación.
 * ============================================================================
 */
class TradingStrategyFactory {
  /**
   * Retorna la clase de estrategia correspondiente ("buy" o "sell").
   */
  static getStrategy(type: "buy" | "sell"): OrderStrategy {
    if (type === "buy") return new BuyOrderStrategy();
    if (type === "sell") return new SellOrderStrategy();
    throw new Error("Tipo de orden no soportado");
  }
}

/**
 * ============================================================================
 * SERVICIO DE TRADING (TradingService)
 * Orquestador principal que expone la API pública del módulo de trading.
 * ============================================================================
 */
export class TradingService {
  /**
   * Solicita y ejecuta una orden de trading usando la fábrica y la estrategia adecuada.
   */
  async executeOrder(
    type: "buy" | "sell",
    userId: string,
    symbol: string,
    quantity: number,
  ): Promise<Transaction> {
    // Consigue la estrategia adecuada mediante el Factory (Compra o Venta)
    const strategy = TradingStrategyFactory.getStrategy(type);
    // Ejecuta la transacción delegando la lógica a la estrategia obtenida
    return strategy.execute(userId, symbol, quantity);
  }

  /**
   * Recupera el historial de transacciones realizadas por un usuario específico.
   */
  getTransactionHistory(userId: string): Transaction[] {
    return storage.getTransactionsByUserId(userId);
  }
}