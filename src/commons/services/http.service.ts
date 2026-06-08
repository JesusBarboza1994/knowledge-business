import { Injectable } from '@nestjs/common'
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

@Injectable()
export class HttpService {
  private readonly axiosInstance: AxiosInstance

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: '',
      timeout: 10000,
    })
  }

  private async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    url: string,
    data?: any,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    const mergedHeaders = {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    const requestConfig: AxiosRequestConfig = {
      ...config,
      method,
      url,
      headers: mergedHeaders,
      ...(data ? { data } : {}),
    }

    return this.axiosInstance.request<T>(requestConfig)
  }

  async get<T = any>(
    url: string,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request('GET', url, undefined, token, headers, config)
  }

  async post<T = any>(
    url: string,
    data: any,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request('POST', url, data, token, headers, config)
  }

  async put<T = any>(
    url: string,
    data: any,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request('PUT', url, data, token, headers, config)
  }

  async delete<T = any>(
    url: string,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request('DELETE', url, undefined, token, headers, config)
  }

  async patch<T = any>(
    url: string,
    data: any,
    token?: string,
    headers?: Record<string, string>,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.request('PATCH', url, data, token, headers, config)
  }
}
