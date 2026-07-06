package com.clipbridge.di

import android.content.Context
import androidx.room.Room
import com.clipbridge.data.ClipBridgeDatabase
import com.clipbridge.data.ClipboardManagerHelper
import com.clipbridge.data.DiscoveryManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): ClipBridgeDatabase {
        return Room.databaseBuilder(
            context,
            ClipBridgeDatabase::class.java,
            "clipbridge_db"
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    @Singleton
    fun provideClipboardHelper(@ApplicationContext context: Context): ClipboardManagerHelper {
        return ClipboardManagerHelper(context)
    }

    @Provides
    @Singleton
    fun provideDiscoveryManager(@ApplicationContext context: Context): DiscoveryManager {
        return DiscoveryManager(context)
    }
}
