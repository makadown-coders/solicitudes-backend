// src/enums/AzureEndpoint.enum.ts

/**
 * Enumerador para los endpoints de Azure para existencias
 */
export enum AzureEndpoint {
  INVENTARIO = 'AZURE_INV_URL', // inventario de los 3 almacenes  
  HGENS = 'AZURE_HGENS_URL',
  HGMXL = 'AZURE_HGMXL_URL',
  HGTKT = 'AZURE_HGTKT_URL',
  HGTIJ = 'AZURE_HGTIJ_URL',
  HMITIJ = 'AZURE_HMITIJ_URL',
  HGPR = 'AZURE_HGPR_URL',
  HMIMXL = 'AZURE_HMIMXL_URL',
  UOMXL = 'AZURE_UOMXL_URL',
  HGTZE = 'AZURE_HGTZE_URL'
}
