package com.clipbridge.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "paired_devices")
data class PairedDevice(
    @PrimaryKey val id: String,
    val name: String,
    val syncKey: ByteArray, // derived symmetric key
    val lastActive: Long
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as PairedDevice
        if (id != other.id) return false
        return true
    }

    override fun hashCode(): Int {
        return id.hashCode()
    }
}

@Entity(tableName = "clipboard_history")
data class ClipboardHistoryItem(
    @PrimaryKey val id: String,
    val content: String,
    val timestamp: Long,
    val originDeviceName: String
)

@Dao
interface PairedDeviceDao {
    @Query("SELECT * FROM paired_devices")
    fun getAllDevices(): Flow<List<PairedDevice>>

    @Query("SELECT * FROM paired_devices")
    suspend fun getAllDevicesList(): List<PairedDevice>

    @Query("SELECT * FROM paired_devices WHERE id = :id LIMIT 1")
    suspend fun getDeviceById(id: String): PairedDevice?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDevice(device: PairedDevice)

    @Delete
    suspend fun deleteDevice(device: PairedDevice)
}

@Dao
interface ClipboardHistoryDao {
    @Query("SELECT * FROM clipboard_history ORDER BY timestamp DESC")
    fun getAllHistory(): Flow<List<ClipboardHistoryItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertItem(item: ClipboardHistoryItem)

    @Query("DELETE FROM clipboard_history WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM clipboard_history")
    suspend fun clearHistory()
}

@Database(entities = [PairedDevice::class, ClipboardHistoryItem::class], version = 1, exportSchema = false)
abstract class ClipBridgeDatabase : RoomDatabase() {
    abstract fun pairedDeviceDao(): PairedDeviceDao
    abstract fun clipboardHistoryDao(): ClipboardHistoryDao
}
